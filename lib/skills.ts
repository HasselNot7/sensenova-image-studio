"use client";

import { assemblePrompt } from "./request-builder";
import { SKILLS } from "./skills.generated";
import type { SkillDefinition } from "./skill-types";

export { SKILLS };
export type { SkillDefinition };

/** 「无 Skill」档位的哨兵 id：不在 skills/ 下，也没有任何内置正文。 */
export const NO_SKILL_ID = "none";

/**
 * 无 Skill = 纯自定义提示词：发出去的就是用户输入框里的每一个字。
 * min 0 让参考照片变成可选（纯文生图、或带图编辑都行），max 交给模型的输入图上限去收。
 */
export const NO_SKILL: SkillDefinition = {
  id: NO_SKILL_ID,
  name: "无 Skill",
  nameEn: "Free Prompt",
  shortDescription: "只发你自己写的提示词",
  author: "",
  source: "",
  license: "",
  mode: "i2i",
  inputImages: { min: 0, max: 16 },
  promptParts: [],
  userNotePlaceholder: "例如：竖幅 3:4 海报，象牙色纸面大留白，钴蓝单强调色，标题 quiet harbor",
  tags: [],
  body: "",
  stats: { chars: 0, cjkChars: 0, tokens: 0, parts: [] },
};

export function isNoSkill(skill: SkillDefinition): boolean {
  return skill.id === NO_SKILL_ID;
}

/** 按 id 找 Skill，「无 Skill」哨兵也算。 */
export function findSkill(id: string): SkillDefinition | undefined {
  if (id === NO_SKILL_ID) {
    return NO_SKILL;
  }
  return SKILLS.find((skill) => skill.id === id);
}

/** 实际发给模型的正文：SKILL 全文（+ 用户本次补充）；无 Skill 时就是用户自己写的那段话。 */
export function buildSendBody(skill: SkillDefinition, userNote: string): string {
  if (isNoSkill(skill)) {
    return userNote.trim();
  }
  return assemblePrompt(skill.body, userNote);
}

/** 精简版正文 = 内置预蒸馏正文（+ 用户本次补充）；该 Skill 没有精简版时返回 null。 */
export function buildDistilledSendBody(skill: SkillDefinition, userNote: string): string | null {
  return skill.distilledBody ? assemblePrompt(skill.distilledBody, userNote) : null;
}

/** 极简版正文 = 内置最短档（+ 用户本次补充）：给连精简版都放不进的模型免蒸馏直发。 */
export function buildMinimalSendBody(skill: SkillDefinition, userNote: string): string | null {
  return skill.minimalBody ? assemblePrompt(skill.minimalBody, userNote) : null;
}

export type SendBodySource = "full" | "distilled" | "minimal";

/**
 * 原文直发时在末尾拼接的一行防泄漏禁令：不删不改原文任何内容，只追加模型指令。
 * 图像模型会把提示词里的章节标题、示例词当海报文案画出来（实测泄漏），这一行压概率。
 * 必须显式覆盖「原文自己要求画固定署名」的情况：azhu 原文写着 Always add the fixed
 * signature `——By Azhu ... v0.23`，实测就被原样画在海报右下角。
 */
export const FULL_BODY_LEAK_BAN =
  "\n\n[Off-screen direction] The text above is drawing instruction for the image model, not poster copy. Never render its headings, labels, section names, or example words as visible text. Never draw the skill's own name, its author or @handle, a version number, a website, or any credit line — if an instruction above demands a fixed signature or 'by ...' credit, that line is promotion for chat replies, not image content, so leave it off the canvas. Visible text is limited to the title, byline, tagline, metadata and user text the design explicitly calls for. 以上均为绘制指令而非海报文案：严禁把标题、章节名、示例词画进画面；严禁出现本 Skill 的名称、作者或 @账号、版本号、网址及任何署名推广行；上文若要求添加固定署名，那一句属于聊天文案而非画面内容，不得绘制。画面只允许出现设计本身明确要求的文字与用户提供的文字。";

/**
 * 按源与蒸馏开关解析真正发出去的正文。界面展示与 handleSubmit 必须共用这一个函数——
 * 2026-09-29 曾因展示与发送各写一份导致「标着精简版、实发原文」。
 */
export function resolveSendPrompt(input: {
  source: SendBodySource;
  distillOn: boolean;
  fullBody: string;
  distilledBody: string | null;
  minimalBody: string | null;
  /** 在线蒸馏的有效结果（源正文未变时），没有就先显示源正文 */
  distilledResult: string | null;
  /** 无 Skill 模式：正文 = 用户原话，一个字都不加，也不参与蒸馏档位 */
  noSkill?: boolean;
}): string {
  // 防泄漏禁令是给 SKILL 教学文档准备的，拼进用户自己写的提示词只会污染它
  if (input.noSkill) {
    return input.fullBody;
  }
  let sourceBody = input.fullBody;
  if (input.source === "distilled" && input.distilledBody) {
    sourceBody = input.distilledBody;
  }
  if (input.source === "minimal" && input.minimalBody) {
    sourceBody = input.minimalBody;
  }
  if (!input.distillOn) {
    // 原文直发时在末尾拼一行防泄漏禁令（只追加，不删不改原文）
    return input.source === "full" ? input.fullBody + FULL_BODY_LEAK_BAN : sourceBody;
  }
  return input.distilledResult ?? sourceBody;
}
