export type ModelId = "sensenova-u1-fast" | "sensenova-u1.5-lite";

export const U1_FAST = "sensenova-u1-fast";
export const U1_LITE = "sensenova-u1.5-lite";

export const SENSENOVA_BASE_URL = "https://token.sensenova.cn/v1";

export const PROMPT_MAX_CHARS_U1_FAST = 4096;

export interface ModelInfo {
  id: ModelId;
  name: string;
  description: string;
}

export const GENERATE_MODELS: ModelInfo[] = [
  {
    id: U1_FAST,
    name: "sensenova-u1-fast",
    description: "高速文生图，11 个固定 2K 尺寸，返回链接仅 1 小时有效",
  },
  {
    id: U1_LITE,
    name: "sensenova-u1.5-lite",
    description: "支持尺寸/格式/prompt 润色等全量参数，同时支持图片编辑",
  },
];

export interface SizeOption {
  /** 技术值（等宽字体展示） */
  value: string;
  label: string;
  /** 括号内中文注（保持中文字体） */
  note?: string;
}

export const U1_FAST_SIZES: SizeOption[] = [
  { value: "2752x1536", label: "2752x1536", note: "（16:9，默认）" },
  { value: "1664x2496", label: "1664x2496", note: "（2:3）" },
  { value: "2496x1664", label: "2496x1664", note: "（3:2）" },
  { value: "1760x2368", label: "1760x2368", note: "（3:4）" },
  { value: "2368x1760", label: "2368x1760", note: "（4:3）" },
  { value: "1824x2272", label: "1824x2272", note: "（4:5）" },
  { value: "2272x1824", label: "2272x1824", note: "（5:4）" },
  { value: "2048x2048", label: "2048x2048", note: "（1:1）" },
  { value: "1536x2752", label: "1536x2752", note: "（9:16）" },
  { value: "3072x1376", label: "3072x1376", note: "（21:9）" },
  { value: "1344x3136", label: "1344x3136", note: "（9:21）" },
];

export const U1_FAST_DEFAULT_SIZE = "2752x1536";

export const CUSTOM_SIZE_VALUE = "__custom__";

export const U1_LITE_SIZE_PRESETS: SizeOption[] = [
  { value: "auto", label: "auto", note: "（自动，默认）" },
  { value: "2048x2048", label: "2048x2048", note: "（1:1）" },
  { value: "2720x1536", label: "2720x1536", note: "（16:9）" },
  { value: "1536x2720", label: "1536x2720", note: "（9:16）" },
  { value: "1664x2496", label: "1664x2496", note: "（2:3）" },
  { value: "2496x1664", label: "2496x1664", note: "（3:2）" },
  { value: "4096x4096", label: "4096x4096", note: "（1:1 4K）" },
  { value: CUSTOM_SIZE_VALUE, label: "自定义 WIDTHxHEIGHT" },
];

export const U1_LITE_DEFAULT_SIZE = "auto";

export type OutputFormat = "png" | "jpeg" | "webp";
export type ResponseFormat = "b64_json" | "url";

export const OUTPUT_FORMATS: OutputFormat[] = ["png", "jpeg", "webp"];
export const RESPONSE_FORMATS: ResponseFormat[] = ["b64_json", "url"];

export interface GenerationRequest {
  model: ModelId;
  prompt: string;
  size: string;
  n: number;
  watermark: boolean;
  output_format?: OutputFormat;
  response_format?: ResponseFormat;
  prompt_extend?: boolean;
}

export interface EditRequest {
  model: typeof U1_LITE;
  images: { image_url: string }[];
  prompt: string;
  n: number;
  size: string;
  response_format: ResponseFormat;
  watermark: boolean;
  prompt_extend: boolean;
}

/** 代理保证返回给前端的 b64_json 始终是可直接展示的 Data-URL */
export interface ProxyImageResponse {
  created: number;
  data: { b64_json: string }[];
}

export interface UpstreamErrorBody {
  error?: {
    type?: string;
    code?: string | number;
    message?: string;
  };
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isImageDataURL(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[\s\S]+/.test(value);
}

export function validateCustomSize(size: string): string | null {
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!match) {
    return "自定义尺寸格式必须为 WIDTHxHEIGHT，例如 2048x1152";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  for (const side of [width, height]) {
    if (side < 512 || side > 4096) {
      return "宽高必须在 512 ~ 4096 之间";
    }
    if (side % 32 !== 0) {
      return "宽高必须是 32 的倍数";
    }
  }
  const ratio = width >= height ? width / height : height / width;
  if (ratio > 3) {
    return "宽高比最大支持 3:1 或 1:3";
  }
  return null;
}
