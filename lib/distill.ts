/**
 * SKILL 蒸馏：出图前先用一个文本模型把 SKILL 原文压进图像模型的提示词上限。
 *
 * 走 OpenAI 兼容的 `POST {base}/chat/completions`（各家都提供这个形状）；
 * base、模型名与密钥都由用户在设置里填，本仓库不预设也不冒充任何家的默认值。
 */

export const DISTILL_MAX_INPUT_CHARS = 200_000;

/** 蒸馏指令：只压缩、不改写、不新增；额外要求剥掉 Skill 自身身份并保留幕后指令声明。 */
export const DISTILL_SYSTEM_PROMPT = `你是图像提示词蒸馏器。把用户给出的 SKILL 原文压缩成一段可以直接发给图像模型的提示词。

规则：
1. 只保留会影响画面的内容：构图与版式、主体如何处理、色彩与材质、文字排布、以及原文的禁止项。
2. 删掉所有写给编程 agent 的工程指令：读取文件、运行脚本、打包 ZIP、返回路径、回复格式、成本控制、许可声明。
3. 删掉一切关于本 Skill 自身身份的表述与指令：Skill 名称、作者名或 @账号、版本号、官网网址、分享署名，以及「必须画上固定签名」这类要求。图像模型会把它们原样画到画面上。为作品本身设计的标题、副标题、元数据规则要保留。
4. 保持原文语言（中文保持中文，英文保持英文），逐条保留硬性禁令，不改写它们的措辞强度。
5. 不得新增原文没有的主体、风格、颜色或艺术家。
6. 结尾保留一句幕后指令：本提示词是给图像模型的绘制指令，不是画面文案；严禁把提示词里的标题、章节名、角色标签、示例词画成画面上的可见文字。
7. 输出不超过 {{TARGET_TOKENS}}，只输出提示词正文本身：不要解释、不要标题、不要引号、不要代码块。`;

export function buildDistillSystemPrompt(target: number, unit: "tokens" | "chars" = "tokens"): string {
  return DISTILL_SYSTEM_PROMPT.replace(
    "{{TARGET_TOKENS}}",
    unit === "chars" ? `${target} 字符（characters）` : `${target} token`,
  );
}

export interface DistillChatPayload {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  temperature: number;
  /** 蒸馏输出很短，给个固定上限防止跑飞 */
  max_tokens: number;
  stream: false;
}

export function buildDistillPayload(input: {
  model: string;
  targetTokens: number;
  /** 图像模型提示词上限的计量单位（Qwen 按 token，SenseNova u1.5 系按字符） */
  unit?: "tokens" | "chars";
  skillBody: string;
  userNote?: string;
}): DistillChatPayload {
  const unit = input.unit ?? "tokens";
  const note = (input.userNote ?? "").trim();
  const body = input.skillBody.trim().slice(0, DISTILL_MAX_INPUT_CHARS);
  const user =
    note.length > 0
      ? `${body}\n\n【本次补充要求，必须保留进蒸馏结果】\n${note}`
      : body;
  return {
    model: input.model,
    messages: [
      { role: "system", content: buildDistillSystemPrompt(input.targetTokens, unit) },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    // 字符口径下 CJK 1 字符 ≈ 1 token，target 字符就是 token 上界；token 口径留 2 倍余量
    max_tokens: Math.max(512, unit === "chars" ? input.targetTokens : input.targetTokens * 2),
    stream: false,
  };
}

/** 从 chat 响应里取正文；兼容 choices[].message.content 与 delta 两种写法。 */
export function parseDistillReply(raw: unknown): string {
  const root = (raw ?? {}) as {
    choices?: { message?: { content?: unknown }; delta?: { content?: unknown } }[];
  };
  const parts: string[] = [];
  for (const choice of root.choices ?? []) {
    const content = choice.message?.content ?? choice.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      parts.push(content);
    } else if (Array.isArray(content)) {
      // 少数兼容端点把 content 拆成分段数组
      for (const item of content) {
        if (typeof item === "object" && item !== null) {
          const text = (item as { text?: unknown }).text;
          if (typeof text === "string") {
            parts.push(text);
          }
        }
      }
    }
  }
  return parts.join("").trim();
}

/** 剥掉模型偶尔加上的 ``` 代码块外壳。 */
export function stripCodeFence(text: string): string {
  const match = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(text.trim());
  return (match ? match[1] : text).trim();
}

/** 蒸馏目标：图像模型建议上限的 90%，留出补充要求的余量。 */
export function distillTargetTokens(modelLimit: number | null, override: string): number | null {
  const custom = Number(override.trim());
  if (override.trim().length > 0 && Number.isFinite(custom) && custom > 0) {
    return Math.floor(custom);
  }
  if (modelLimit === null) {
    return null;
  }
  return Math.floor(modelLimit * 0.9);
}
