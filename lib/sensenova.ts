/**
 * SenseNova 图像模型契约（sensenova-u1-fast / sensenova-u1.5-lite）。
 *
 * 事实来源：本项目作者自己的 sensenova 工作台（同一套接口已在其上跑通）与
 * platform.sensenova.cn 官方文档。两个模型走 OpenAI 风格的 /v1/images/*，
 * 与 Qwen 的 multimodal-generation 完全不同，因此这里单独装配请求体。
 */

import { AUTO_SIZE, type InputImagePolicy, type ModelInfo, type SizeOption } from "./models";
import type { StudioRequest } from "./request-builder";

export type SensenovaModelId = "sensenova-u1-fast" | "sensenova-u1.5-lite";

export const SENSENOVA_U1_FAST: SensenovaModelId = "sensenova-u1-fast";
export const SENSENOVA_U1_LITE: SensenovaModelId = "sensenova-u1.5-lite";

export const SENSENOVA_BASE_URL = "https://token.sensenova.cn/v1";

export const SENSENOVA_GENERATIONS_PATH = "images/generations";
export const SENSENOVA_EDITS_PATH = "images/edits";

const SENSENOVA_INPUT_IMAGE: InputImagePolicy = {
  formats: ["image/png", "image/jpeg", "image/webp"],
  minEdge: null,
  defaultMaxEdge: 2048,
  maxEdgeCeiling: 3072,
  allowUncompressed: true,
  maxBytes: 10 * 1024 * 1024,
  hardMaxBytes: false,
};

/** u1-fast 的 prompt 上限（官方 4096 token）；u1.5 系按字符计（上游实测 5000 字符上限） */
const U1_FAST_PROMPT_MAX_TOKENS = 4096;
const U1_LITE_PROMPT_MAX_CHARS = 5000;

/** u1-fast 只能从这 11 个固定常量里选，不接受自定义宽高 */
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

export const U1_LITE_SIZE_PRESETS: SizeOption[] = [
  { value: "2048x2048", label: "2048x2048", note: "（1:1）" },
  { value: "2720x1536", label: "2720x1536", note: "（16:9）" },
  { value: "1536x2720", label: "1536x2720", note: "（9:16）" },
  { value: "1664x2496", label: "1664x2496", note: "（2:3）" },
  { value: "2496x1664", label: "2496x1664", note: "（3:2）" },
  { value: "4096x4096", label: "4096x4096", note: "（1:1 4K）" },
];

export const U1_LITE_DEFAULT_SIZE = "2048x2048";

function validateU1LiteSize(size: string): string | null {
  const match = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!match) {
    return "尺寸格式必须为 WIDTHxHEIGHT（中间是字母 x），例如 2048x1152";
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

function validateU1FastSize(size: string): string | null {
  return U1_FAST_SIZES.some((option) => option.value === size)
    ? null
    : "sensenova-u1-fast 只能选官方提供的 11 个固定尺寸";
}

const SENSENOVA_MODEL_BASE: Omit<
  ModelInfo,
  "id" | "name" | "description" | "promptTokenLimit" | "promptLimitUnit" | "sizePresets" | "defaultSize" | "validateSize"
> = {
  maxInputImages: 1,
  maxN: 1,
  acceptsImages: false,
  supportsPromptExtend: false,
  supportsPromptExtendMode: false,
  supportsEnableThinking: false,
  supportsNegativePrompt: false,
  supportsSeed: false,
  supportsWatermark: true,
  sizeSeparator: "x",
  inputImage: SENSENOVA_INPUT_IMAGE,
};

export const SENSENOVA_MODELS: ModelInfo[] = [
  {
    ...SENSENOVA_MODEL_BASE,
    id: SENSENOVA_U1_LITE,
    name: SENSENOVA_U1_LITE,
    description: "文生图 + 图片编辑，提示词 ≤5000 字符（按字符计）；返回链接 24 小时过期",
    promptTokenLimit: U1_LITE_PROMPT_MAX_CHARS,
    promptLimitUnit: "chars",
    acceptsImages: true,
    maxInputImages: 1,
    supportsPromptExtend: true,
    sizePresets: U1_LITE_SIZE_PRESETS,
    defaultSize: U1_LITE_DEFAULT_SIZE,
    validateSize: validateU1LiteSize,
  },
  {
    ...SENSENOVA_MODEL_BASE,
    id: SENSENOVA_U1_FAST,
    name: SENSENOVA_U1_FAST,
    description: "只能文生图，尺寸是 11 个固定常量；返回链接 1 小时过期",
    promptTokenLimit: U1_FAST_PROMPT_MAX_TOKENS,
    promptLimitUnit: "tokens",
    sizePresets: U1_FAST_SIZES,
    defaultSize: U1_FAST_DEFAULT_SIZE,
    validateSize: validateU1FastSize,
  },
];

export function findSensenovaModel(id: string): ModelInfo | undefined {
  return SENSENOVA_MODELS.find((model) => model.id === id);
}

export interface BuiltPayload {
  /** 相对 SENSENOVA_BASE_URL 的路径 */
  path: string;
  body: Record<string, unknown>;
}

/**
 * 装配 SenseNova 请求体。带输入图 → edits 端点（仅 u1.5-lite）；
 * response_format 固定 b64_json：本站代理本来就要求可直接展示的图。
 */
export function buildSensenovaPayload(request: StudioRequest): BuiltPayload {
  const model = findSensenovaModel(request.model);
  const isEdit = request.images.length > 0 && model?.id === SENSENOVA_U1_LITE;
  const base: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    n: 1,
    watermark: request.watermark,
  };
  if (request.size !== AUTO_SIZE) {
    base.size = request.size;
  }
  if (model?.id === SENSENOVA_U1_LITE) {
    base.response_format = "b64_json";
    base.prompt_extend = request.prompt_extend;
  }
  if (isEdit) {
    return {
      path: SENSENOVA_EDITS_PATH,
      body: {
        model: request.model,
        images: request.images.map((image_url) => ({ image_url })),
        prompt: request.prompt,
        n: 1,
        ...(request.size === AUTO_SIZE ? {} : { size: request.size }),
        response_format: "b64_json",
        watermark: request.watermark,
        prompt_extend: request.prompt_extend,
      },
    };
  }
  return { path: SENSENOVA_GENERATIONS_PATH, body: base };
}

const GENERATION_KEYS_FAST = ["model", "prompt", "size", "n", "watermark"];
const GENERATION_KEYS_LITE = [
  "model",
  "prompt",
  "size",
  "n",
  "watermark",
  "response_format",
  "prompt_extend",
];
const EDIT_KEYS = [
  "model",
  "images",
  "prompt",
  "size",
  "n",
  "watermark",
  "response_format",
  "prompt_extend",
];

function isImageUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return /^https?:\/\//i.test(value.trim()) || /^data:image\/[a-zA-Z0-9.+-]+;base64,[\s\S]+/.test(value);
}

export interface SensenovaValidationIssue {
  field: string;
  message: string;
}

/** 代理侧二次校验：只放行官方参数表里存在的字段。 */
export function validateSensenovaPayload(
  raw: unknown,
  endpoint: string,
): SensenovaValidationIssue | null {
  if (typeof raw !== "object" || raw === null) {
    return { field: "body", message: "请求体必须是 JSON 对象" };
  }
  const body = raw as Record<string, unknown>;
  const model = typeof body.model === "string" ? body.model : "";
  if (model !== SENSENOVA_U1_FAST && model !== SENSENOVA_U1_LITE) {
    return {
      field: "model",
      message: `model 必须是 ${SENSENOVA_U1_FAST} 或 ${SENSENOVA_U1_LITE}`,
    };
  }
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return { field: "prompt", message: "prompt 必填且去空格后不能为空" };
  }
  if (typeof body.watermark !== "boolean") {
    return { field: "watermark", message: "watermark 必须显式传入布尔值" };
  }
  if (body.n !== undefined && body.n !== 1) {
    return { field: "n", message: "SenseNova 图像接口当前仅支持 n=1" };
  }
  if (endpoint === SENSENOVA_EDITS_PATH) {
    if (model !== SENSENOVA_U1_LITE) {
      return { field: "model", message: "图片编辑仅 sensenova-u1.5-lite 支持" };
    }
    const images = body.images;
    if (!Array.isArray(images) || images.length === 0 || images.length > 1) {
      return { field: "images", message: "images 必须是 1 个元素的数组" };
    }
    for (const item of images) {
      if (typeof item !== "object" || item === null || !isImageUrl((item as { image_url?: unknown }).image_url)) {
        return {
          field: "images",
          message: "image_url 仅支持完整 http(s) 链接或 data:image/*;base64 Data-URL",
        };
      }
    }
    for (const key of Object.keys(body)) {
      if (!EDIT_KEYS.includes(key)) {
        return { field: key, message: `图片编辑不支持参数 "${key}"` };
      }
    }
    return null;
  }
  if (model === SENSENOVA_U1_FAST) {
    if (typeof body.size === "string" && validateU1FastSize(body.size)) {
      return { field: "size", message: validateU1FastSize(body.size) as string };
    }
  } else if (typeof body.size === "string" && !U1_LITE_SIZE_PRESETS.some((p) => p.value === body.size)) {
    const error = validateU1LiteSize(body.size);
    if (error) {
      return { field: "size", message: error };
    }
  }
  const allowed = model === SENSENOVA_U1_FAST ? GENERATION_KEYS_FAST : GENERATION_KEYS_LITE;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      return { field: key, message: `${model} 不支持参数 "${key}"，禁止发送未定义字段` };
    }
  }
  return null;
}
