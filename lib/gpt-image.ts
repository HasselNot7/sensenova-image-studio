/**
 * OpenAI GPT Image 图像模型契约（gpt-image-2.5-sunburst / gpt-image-2.5-flare）。
 *
 * 事实来源：OpenAI 官方 OpenAPI 规范（github.com/openai/openai-openapi master 分支
 * openapi.yaml，2026-09-29 拉取核对）。字段名、枚举取值、尺寸与张数上限全部照抄规范，
 * 未标注的一律不发明：规范没写边长下限，这里就不设；规范写「>2560x1440 属实验性」，
 * 这里只写进描述、不做拦截。规范里还有 gpt-image-2 / 1.5 / 1 / 1-mini 与 chatgpt-image-latest，
 * 本工作台按用户口径只挂 2.5 系两个。
 *
 * 两个端点都是 OpenAI 风格：POST /v1/images/generations（文生图）与
 * POST /v1/images/edits（图生图）。edits 支持 application/json，图片用
 * `images: [{ image_url }]` 引用，官方明确「A fully qualified URL or base64-encoded
 * data URL」，所以本站的 Data-URL 直接能发，不必走 multipart。
 */

import { AUTO_SIZE, CUSTOM_SIZE_VALUE, type InputImagePolicy, type ModelInfo, type SizeOption } from "./models";
import type { StudioRequest } from "./request-builder";

export const GPT_IMAGE_BASE_URL = "https://api.openai.com/v1";
export const GPT_IMAGE_GENERATIONS_PATH = "images/generations";
export const GPT_IMAGE_EDITS_PATH = "images/edits";

/** 规范：GPT image 模型 prompt 最长 32000 字符（dall-e 系才 1000/4000）。 */
export const GPT_IMAGE_PROMPT_MAX_CHARS = 32000;
/** 规范：n 1~10；edits 的 images 最多 16 张。 */
export const GPT_IMAGE_MAX_N = 10;
export const GPT_IMAGE_MAX_INPUT_IMAGES = 16;
/** 规范：ImageRefParam.image_url 的 maxLength 是 20971520 个字符（Data-URL 也算字符）。 */
export const GPT_IMAGE_MAX_IMAGE_URL_CHARS = 20_971_520;
/** 规范：输入图 png/webp/jpg 单张 <50MB；Base64 膨胀约 4/3，走 Data-URL 时原图实际天花板更低。 */
export const GPT_IMAGE_INPUT_MAX_BYTES = 15 * 1024 * 1024;

const GPT_IMAGE_INPUT_IMAGE: InputImagePolicy = {
  formats: ["image/png", "image/jpeg", "image/webp"],
  minEdge: null,
  defaultMaxEdge: 2048,
  maxEdgeCeiling: 4096,
  allowUncompressed: true,
  maxBytes: GPT_IMAGE_INPUT_MAX_BYTES,
  hardMaxBytes: true,
};

export const GPT_IMAGE_SUNBURST = "gpt-image-2.5-sunburst";
export const GPT_IMAGE_FLARE = "gpt-image-2.5-flare";

/** 三个标准尺寸全 GPT image 模型通用（规范原文列举）。 */
export const GPT_IMAGE_STANDARD_SIZES: SizeOption[] = [
  { value: "1024x1024", label: "1024x1024", note: "（1:1）" },
  { value: "1536x1024", label: "1536x1024", note: "（3:2 横）" },
  { value: "1024x1536", label: "1024x1536", note: "（2:3 竖）" },
];

const AUTO_PRESET: SizeOption = { value: AUTO_SIZE, label: "auto", note: "（不发 size，由模型定）" };

/** 2.5 系可传任意 WIDTHxHEIGHT（规范原文），也保留三个标准值方便快选。 */
const SIZE_PRESETS: SizeOption[] = [
  AUTO_PRESET,
  ...GPT_IMAGE_STANDARD_SIZES,
  { value: CUSTOM_SIZE_VALUE, label: "自定义 WIDTHxHEIGHT" },
];

/** 规范：宽高都要被 16 整除、比例 1:3 ~ 3:1，最大分辨率 3840x2160。 */
export function validateGptImageArbitrarySize(size: string): string | null {
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!match) {
    return "尺寸格式必须为 WIDTHxHEIGHT（中间是字母 x），例如 1536x864";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  for (const side of [width, height]) {
    if (side % 16 !== 0) {
      return "宽高必须都是 16 的倍数";
    }
  }
  const ratio = width >= height ? width / height : height / width;
  if (ratio > 3) {
    return "宽高比只支持 1:3 ~ 3:1";
  }
  if (Math.max(width, height) > 3840 || width * height > 3840 * 2160) {
    return "最大支持 3840x2160（超过 2560x1440 属实验性）";
  }
  return null;
}

const GPT_IMAGE_MODEL_BASE: Omit<ModelInfo, "id" | "name" | "description"> = {
  promptTokenLimit: GPT_IMAGE_PROMPT_MAX_CHARS,
  promptLimitUnit: "chars",
  maxInputImages: GPT_IMAGE_MAX_INPUT_IMAGES,
  maxN: GPT_IMAGE_MAX_N,
  acceptsImages: true,
  supportsPromptExtend: false,
  supportsPromptExtendMode: false,
  supportsEnableThinking: false,
  supportsNegativePrompt: false,
  supportsSeed: false,
  supportsWatermark: false,
  sizeSeparator: "x",
  defaultSize: AUTO_SIZE,
  inputImage: GPT_IMAGE_INPUT_IMAGE,
  sizePresets: SIZE_PRESETS,
  validateSize: validateGptImageArbitrarySize,
};

export const GPT_IMAGE_MODELS: ModelInfo[] = [
  {
    ...GPT_IMAGE_MODEL_BASE,
    id: GPT_IMAGE_SUNBURST,
    name: GPT_IMAGE_SUNBURST,
    description: "2.5 系；任意尺寸（16 倍数、比例 ≤3:1、≤3840x2160），画质可选 low~max",
  },
  {
    ...GPT_IMAGE_MODEL_BASE,
    id: GPT_IMAGE_FLARE,
    name: GPT_IMAGE_FLARE,
    description: "2.5 系；任意尺寸（16 倍数、比例 ≤3:1、≤3840x2160），画质可选 low~max",
  },
];

export function findGptImageModel(id: string): ModelInfo | undefined {
  return GPT_IMAGE_MODELS.find((model) => model.id === id);
}

export interface GptImageBuiltPayload {
  /** 相对 GPT_IMAGE_BASE_URL 的路径 */
  path: string;
  body: Record<string, unknown>;
}

/**
 * 装配 GPT Image 请求体。带输入图 → edits（JSON 形态，images 用 Data-URL 引用）。
 * 只发规范里存在的字段：quality / background / input_fidelity / moderation 一律不发，
 * 让上游按默认 auto 处理（本站界面没有这些控件，发了就是替用户做决定）。
 */
export function buildGptImagePayload(request: StudioRequest): GptImageBuiltPayload {
  const core: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    n: Math.min(Math.max(request.n, 1), GPT_IMAGE_MAX_N),
  };
  if (request.size !== AUTO_SIZE) {
    core.size = request.size;
  }
  if (request.images.length > 0) {
    return {
      path: GPT_IMAGE_EDITS_PATH,
      body: { ...core, images: request.images.map((image_url) => ({ image_url })) },
    };
  }
  return { path: GPT_IMAGE_GENERATIONS_PATH, body: core };
}

const GENERATION_KEYS = ["model", "prompt", "n", "size", "quality", "background", "output_format", "output_compression", "moderation", "stream", "partial_images", "user"];
const EDIT_KEYS = [...GENERATION_KEYS, "images", "mask", "input_fidelity"];

function isImageRef(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as Record<string, unknown>;
  const url = ref.image_url;
  if (typeof url !== "string" || url.length === 0) {
    return false;
  }
  return (
    url.length <= GPT_IMAGE_MAX_IMAGE_URL_CHARS &&
    (/^https?:\/\//i.test(url) || /^data:image\/[a-zA-Z0-9.+-]+;base64,[\s\S]+$/.test(url))
  );
}

export interface GptImageValidationIssue {
  field: string;
  message: string;
}

/** 代理侧二次校验：只放行官方参数表里存在的字段，越界字段一律拒发。 */
export function validateGptImagePayload(
  raw: unknown,
  endpoint: string,
): GptImageValidationIssue | null {
  if (typeof raw !== "object" || raw === null) {
    return { field: "body", message: "请求体必须是 JSON 对象" };
  }
  const body = raw as Record<string, unknown>;
  const model = typeof body.model === "string" ? body.model : "";
  if (!findGptImageModel(model)) {
    return {
      field: "model",
      message: `model 必须是 ${GPT_IMAGE_MODELS.map((item) => item.id).join(" / ")}`,
    };
  }
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return { field: "prompt", message: "prompt 必填且去空格后不能为空" };
  }
  if (body.prompt.length > GPT_IMAGE_PROMPT_MAX_CHARS) {
    return {
      field: "prompt",
      message: `prompt 最长 ${GPT_IMAGE_PROMPT_MAX_CHARS} 字符，当前 ${body.prompt.length}`,
    };
  }
  if (body.n !== undefined) {
    if (typeof body.n !== "number" || !Number.isInteger(body.n) || body.n < 1 || body.n > GPT_IMAGE_MAX_N) {
      return { field: "n", message: `n 必须是 1 ~ ${GPT_IMAGE_MAX_N} 的整数` };
    }
  }
  if (typeof body.size === "string") {
    const error = validateGptImageArbitrarySize(body.size);
    if (error) {
      return { field: "size", message: error };
    }
  }
  if (endpoint === GPT_IMAGE_EDITS_PATH) {
    const images = body.images;
    if (!Array.isArray(images) || images.length === 0) {
      return { field: "images", message: "images 必须是至少 1 个元素的数组" };
    }
    if (images.length > GPT_IMAGE_MAX_INPUT_IMAGES) {
      return { field: "images", message: `最多 ${GPT_IMAGE_MAX_INPUT_IMAGES} 张输入图` };
    }
    for (const item of images) {
      if (!isImageRef(item)) {
        return {
          field: "images",
          message:
            "image_url 必须是完整 http(s) 链接或 data:image/*;base64 Data-URL，且不超过 20971520 字符",
        };
      }
    }
  } else if (body.images !== undefined) {
    return { field: "images", message: "文生图端点不接受 images，图生图请走 images/edits" };
  }
  const allowed = endpoint === GPT_IMAGE_EDITS_PATH ? EDIT_KEYS : GENERATION_KEYS;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      return { field: key, message: `${model} 不支持参数 "${key}"，禁止发送未定义字段` };
    }
  }
  return null;
}
