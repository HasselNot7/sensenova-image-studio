/**
 * 阿里云百炼（Model Studio / DashScope）Qwen Image 契约层。
 *
 * 事实来源：官方《千问-图像生成与编辑 3.0》与《千问-图像生成与编辑》API 参考。
 * 逐字照抄接口事实，禁止增删字段或臆造取值；文档未标的地方在本文件里写明「文档未标注」。
 */

export type QwenModelId =
  | "qwen-image-3.0-pro"
  | "qwen-image-3.0"
  | "qwen-image-2.0-pro"
  | "qwen-image-2.0";

export const QWEN_IMAGE_3_PRO: QwenModelId = "qwen-image-3.0-pro";
export const QWEN_IMAGE_3: QwenModelId = "qwen-image-3.0";
export const QWEN_IMAGE_2_PRO: QwenModelId = "qwen-image-2.0-pro";
export const QWEN_IMAGE_2: QwenModelId = "qwen-image-2.0";

/** 同步出图端点（相对 base URL）。文生图与图生图共用这一个路径。 */
export const QWEN_GENERATION_PATH = "services/aigc/multimodal-generation/generation";

export interface QwenRegion {
  /** 主机名里的区域段；legacy 是本 SDK 之前的通用域名，不需要 WorkspaceId */
  id: "legacy" | "cn-beijing" | "ap-southeast-1" | "us-east-1" | "eu-central-1" | "ap-northeast-1" | "cn-hongkong";
  label: string;
  /** 是否需要把 {WorkspaceId} 填进主机名 */
  requiresWorkspace: boolean;
}

export const QWEN_REGIONS: QwenRegion[] = [
  { id: "cn-beijing", label: "华北2（北京）", requiresWorkspace: true },
  { id: "ap-southeast-1", label: "新加坡", requiresWorkspace: true },
  { id: "us-east-1", label: "美国（弗吉尼亚）", requiresWorkspace: true },
  { id: "eu-central-1", label: "德国（法兰克福）", requiresWorkspace: true },
  { id: "ap-northeast-1", label: "日本（东京）", requiresWorkspace: true },
  { id: "cn-hongkong", label: "中国香港", requiresWorkspace: true },
  { id: "legacy", label: "通用域名 dashscope.aliyuncs.com（无需 WorkspaceId）", requiresWorkspace: false },
];

export const QWEN_DEFAULT_REGION = "cn-beijing";

/** 由区域 + 业务空间 ID 拼出 `.../api/v1` 形式的 base URL。 */
export function resolveQwenBaseUrl(regionId: string, workspaceId: string): string | null {
  const region = QWEN_REGIONS.find((item) => item.id === regionId);
  if (!region) {
    return null;
  }
  if (region.id === "legacy") {
    return "https://dashscope.aliyuncs.com/api/v1";
  }
  const workspace = workspaceId.trim();
  if (workspace.length === 0) {
    return null;
  }
  return `https://${workspace}.${region.id}.maas.aliyuncs.com/api/v1`;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  /** 正向提示词的官方建议上限；null = 官方未标注，界面只显示字符数不显示比值 */
  promptTokenLimit: number | null;
  /**
   * 上限的计量单位，各家不一样：Qwen 按 token，SenseNova u1.5 系按字符
   * （上游实测报错 "invalid prompt, should not exceed 5000 characters"）。
   * 对比时必须用对应口径：chars 用 budget.chars，tokens 用估算的 budget.tokens。
   */
  promptLimitUnit: "tokens" | "chars";
  maxInputImages: number;
  maxN: number;
  /** 有没有图生图分支（SenseNova 的 u1-fast 只能文生图） */
  acceptsImages: boolean;
  supportsPromptExtend: boolean;
  supportsPromptExtendMode: boolean;
  supportsEnableThinking: boolean;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  /** 上游有没有 watermark 这个开关（千问与 SenseNova 有，GPT Image 没有） */
  supportsWatermark: boolean;
  /** 自定义尺寸的写法则各家不同：千问用 `2048*2048`，OpenAI/SenseNova 用 `2048x2048` */
  sizeSeparator: "*" | "x";
  /** 尺寸下拉常量（各服务商取值集合完全不同） */
  inputImage: InputImagePolicy;
  sizePresets: SizeOption[];
  defaultSize: string;
  /** 返回 null 表示合法，否则是给用户看的中文原因 */
  validateSize: (size: string) => string | null;
}

export interface SizeOption {
  /** 技术值（等宽字体展示），形如 `2048*2048` 或 `auto` */
  value: string;
  label: string;
  /** 括号内中文注（保持中文字体） */
  note?: string;
}

export const AUTO_SIZE = "auto";
export const CUSTOM_SIZE_VALUE = "__custom__";

/**
 * 官方 2.0 建议常量；3.0 只约束「总像素在 512*512 ~ 2048*2048 之间、比例 1:8 ~ 8:1」，
 * 这些常量同样落在该带内，因此共用一份。
 */
export const QWEN_SIZE_PRESETS: SizeOption[] = [
  { value: AUTO_SIZE, label: "auto", note: "（不发 size，由模型定）" },
  { value: "2048*2048", label: "2048*2048", note: "（1:1）" },
  { value: "2688*1536", label: "2688*1536", note: "（16:9）" },
  { value: "1536*2688", label: "1536*2688", note: "（9:16）" },
  { value: "2368*1728", label: "2368*1728", note: "（4:3）" },
  { value: "1728*2368", label: "1728*2368", note: "（3:4）" },
  { value: CUSTOM_SIZE_VALUE, label: "自定义 WIDTH*HEIGHT" },
];

/**
 * 输入图策略：各家限制不一样，别写死。
 * 千问是文档建议值（3.0 写 384~2048、2.0 编辑写 384~3072，均为「建议」非硬拦截）；
 * SenseNova 的 sensenova 工作台把长边做成用户可选（1024/1536/2048/3072 或不压），
 * 10 MB 只是警告线，格式只收 png/jpeg/webp。
 */
export interface InputImagePolicy {
  /** 允许的 MIME */
  formats: string[];
  /** 官方最短边要求；null = 未标注 */
  minEdge: number | null;
  defaultMaxEdge: number;
  /** 滑杆右端：官方标注的推荐长边上限 */
  maxEdgeCeiling: number;
  /** 允许「不压缩」把原图长边直接发出去 */
  allowUncompressed: boolean;
  maxBytes: number;
  /** true = 超过 maxBytes 直接拒；false = 只警告 */
  hardMaxBytes: boolean;
}

/** 3.0 文档建议值：边长 384~2048 px（「建议」非硬拦截）、单张 ≤10 MB。 */
export const INPUT_IMAGE_MIN_EDGE = 384;
export const INPUT_IMAGE_MAX_EDGE = 2048;
/** 2.0 编辑文档建议值 384~3072，已对官方页面核实：两份文档各自如此，不矛盾 */
export const INPUT_IMAGE_MAX_EDGE_2X = 3072;
/** 滑杆右端：官方建议只到 3072，4096 是用户拍板的界面口径（超出建议不报错，只更慢） */
export const INPUT_IMAGE_CEILING = 4096;
export const INPUT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const INPUT_IMAGE_MAX_COUNT = 3;


export const INPUT_IMAGE_FORMATS = ["image/jpeg", "image/png", "image/bmp", "image/tiff", "image/webp", "image/gif"];

/** negative_prompt 官方标注最长 500 字符（2.0 文档；3.0 文档未标注，这里沿用同一约束）。 */
export const NEGATIVE_PROMPT_MAX_CHARS = 500;
export const SEED_MIN = 0;
export const SEED_MAX = 2147483647;

export type PromptExtendMode = "direct" | "agent";

export interface QwenImageRequest {
  model: QwenModelId;
  /** 实际发送的正文：SKILL.md 全文（+ 用户补充，已在客户端拼好） */
  prompt: string;
  /** 0~3 张，元素是完整 http(s) 链接或 data:image/*;base64 Data-URL */
  images: string[];
  size: string;
  n: number;
  negative_prompt: string;
  prompt_extend: boolean;
  prompt_extend_mode?: PromptExtendMode;
  enable_thinking?: boolean;
  watermark: boolean;
  seed?: number;
}

/** 代理回给前端的统一形状：b64_json 永远是可直接展示的 Data-URL。 */
export interface ProxyImageResponse {
  created: number;
  data: { b64_json: string }[];
  actual_prompt?: string;
}

/** 上游错误体：DashScope 用顶层 code/message，与 OpenAI 风格的 error.type 不同。 */
export interface UpstreamErrorBody {
  code?: string;
  message?: string;
  request_id?: string;
  error?: { type?: string; code?: string | number; message?: string };
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isImageDataURL(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[\s\S]+/.test(value);
}

/** `WIDTH*HEIGHT`：总像素 512*512 ~ 2048*2048，长短边比 ≤8:1。 */
export function validateCustomSize(size: string): string | null {
  const match = /^(\d+)\*(\d+)$/.exec(size.trim());
  if (!match) {
    return "自定义尺寸格式必须为 WIDTH*HEIGHT（中间是星号），例如 2048*1152";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 16 || height < 16) {
    return "宽高都必须不小于 16 像素";
  }
  const pixels = width * height;
  if (pixels < 512 * 512) {
    return `总像素 ${pixels} 低于官方下限 512*512（262144）`;
  }
  if (pixels > 2048 * 2048) {
    return `总像素 ${pixels} 超过官方上限 2048*2048（4194304）`;
  }
  const ratio = width >= height ? width / height : height / width;
  if (ratio > 8) {
    return "宽高比最大支持 8:1 或 1:8";
  }
  return null;
}

function qwenInputPolicy(ceiling: number, defaultEdge: number = ceiling): InputImagePolicy {
  return {
    formats: INPUT_IMAGE_FORMATS,
    minEdge: INPUT_IMAGE_MIN_EDGE,
    defaultMaxEdge: defaultEdge,
    maxEdgeCeiling: ceiling,
    allowUncompressed: false,
    maxBytes: INPUT_IMAGE_MAX_BYTES,
    hardMaxBytes: true,
  };
}

/** 3.0：默认跟它自己文档的建议（2048）；滑杆右端 4096 是用户拍板，官方建议只到 3072 */
export const QWEN_INPUT_IMAGE = qwenInputPolicy(INPUT_IMAGE_CEILING, INPUT_IMAGE_MAX_EDGE);
export const QWEN_INPUT_IMAGE_2X = qwenInputPolicy(INPUT_IMAGE_CEILING, INPUT_IMAGE_MAX_EDGE_2X);

/* ---------- Qwen 模型清单（依赖上面的常量，故放在预设之后） ---------- */

const QWEN_MODEL_BASE: Omit<ModelInfo, "id" | "name" | "description" | "promptTokenLimit"> = {
  maxInputImages: INPUT_IMAGE_MAX_COUNT,
  maxN: 6,
  acceptsImages: true,
  supportsPromptExtend: true,
  supportsPromptExtendMode: false,
  supportsEnableThinking: false,
  supportsNegativePrompt: true,
  supportsSeed: true,
  supportsWatermark: true,
  sizeSeparator: "*",
  promptLimitUnit: "tokens",
  inputImage: QWEN_INPUT_IMAGE,
  sizePresets: QWEN_SIZE_PRESETS,
  defaultSize: AUTO_SIZE,
  validateSize: validateCustomSize,
};

function qwenModel(
  id: QwenModelId,
  description: string,
  promptTokenLimit: number,
  extra: Partial<ModelInfo> = {},
): ModelInfo {
  return { ...QWEN_MODEL_BASE, id, name: id, description, promptTokenLimit, ...extra };
}

export const QWEN_MODELS: ModelInfo[] = [
  qwenModel(
    QWEN_IMAGE_3_PRO,
    "3.0 旗舰：文生图 + 图像编辑同模型，长提示词与文字排版跟随最好",
    4500,
    { supportsPromptExtendMode: true, supportsEnableThinking: true },
  ),
  qwenModel(
    QWEN_IMAGE_3,
    "3.0 均衡版：兼顾质量与速度，参数面与 pro 一致",
    4500,
    { supportsPromptExtendMode: true, supportsEnableThinking: true },
  ),
  qwenModel(QWEN_IMAGE_2_PRO, "2.0 Pro：文字渲染强，提示词只有 1300 token", 1300, {
    inputImage: QWEN_INPUT_IMAGE_2X,
  }),
  qwenModel(QWEN_IMAGE_2, "2.0 加速版：同上 1300 token 上限，出图更快", 1300, {
    inputImage: QWEN_INPUT_IMAGE_2X,
  }),
];

export function findQwenModel(id: string): ModelInfo | undefined {
  return QWEN_MODELS.find((model) => model.id === id);
}
