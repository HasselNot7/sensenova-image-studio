import {
  CUSTOM_SIZE_VALUE,
  OUTPUT_FORMATS,
  PROMPT_MAX_CHARS_U1_FAST,
  RESPONSE_FORMATS,
  U1_FAST,
  U1_FAST_SIZES,
  U1_LITE,
  type EditRequest,
  type GenerationRequest,
  type ModelId,
  type OutputFormat,
  type ResponseFormat,
  isHttpUrl,
  isImageDataURL,
  validateCustomSize,
} from "./models";

export interface GenerationParams {
  model: ModelId;
  prompt: string;
  /** 最终发送给上游的尺寸（自定义时已解析为 WIDTHxHEIGHT） */
  size: string;
  watermark: boolean;
  outputFormat: OutputFormat;
  responseFormat: ResponseFormat;
  promptExtend: boolean;
}

export function buildGenerationRequest(params: GenerationParams): GenerationRequest {
  const prompt = params.prompt.trim();
  if (params.model === U1_FAST) {
    return {
      model: U1_FAST,
      prompt,
      size: params.size,
      n: 1,
      watermark: params.watermark,
    };
  }
  return {
    model: U1_LITE,
    prompt,
    size: params.size,
    n: 1,
    watermark: params.watermark,
    output_format: params.outputFormat,
    response_format: params.responseFormat,
    prompt_extend: params.promptExtend,
  };
}

export interface EditParams {
  /** 公网 http(s) 链接或 data:image/*;base64 Data-URL */
  imageUrl: string;
  prompt: string;
  size: string;
  watermark: boolean;
  responseFormat: ResponseFormat;
  promptExtend: boolean;
}

export function buildEditRequest(params: EditParams): EditRequest {
  return {
    model: U1_LITE,
    images: [{ image_url: params.imageUrl }],
    prompt: params.prompt.trim(),
    n: 1,
    size: params.size,
    response_format: params.responseFormat,
    watermark: params.watermark,
    prompt_extend: params.promptExtend,
  };
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export function validateGenerationParams(params: {
  model: ModelId;
  prompt: string;
  size: string;
  customSize: string;
}): ValidationIssue | null {
  if (params.prompt.trim().length === 0) {
    return { field: "prompt", message: "提示词不能为空（去除空格后必须至少 1 个字符）" };
  }
  if (params.model === U1_FAST && params.prompt.trim().length > PROMPT_MAX_CHARS_U1_FAST) {
    return {
      field: "prompt",
      message: `提示词超过 ${PROMPT_MAX_CHARS_U1_FAST} 字符，可能超出 sensenova-u1-fast 的 4096 token 上限`,
    };
  }
  if (params.model === U1_FAST) {
    if (!U1_FAST_SIZES.some((s) => s.value === params.size)) {
      return { field: "size", message: "sensenova-u1-fast 只能选择官方提供的 11 个固定尺寸" };
    }
    return null;
  }
  if (params.size === CUSTOM_SIZE_VALUE) {
    const err = validateCustomSize(params.customSize);
    if (err) {
      return { field: "customSize", message: err };
    }
  }
  return null;
}

export function validateEditParams(params: {
  imageUrl: string;
  imageSource: "url" | "upload";
  prompt: string;
  size: string;
  customSize: string;
}): ValidationIssue | null {
  const url = params.imageUrl.trim();
  if (url.length === 0) {
    return { field: "image", message: "请提供参考图（公网 URL 或上传本地文件）" };
  }
  if (!isHttpUrl(url) && !isImageDataURL(url)) {
    return {
      field: "image",
      message: "参考图必须是 http(s):// 开头的完整公网链接，或 data:image/*;base64, 开头的 Data-URL",
    };
  }
  if (params.prompt.trim().length === 0) {
    return { field: "prompt", message: "编辑指令不能为空（去除空格后必须至少 1 个字符）" };
  }
  if (params.size === CUSTOM_SIZE_VALUE) {
    const err = validateCustomSize(params.customSize);
    if (err) {
      return { field: "customSize", message: err };
    }
  }
  return null;
}

const FAST_ALLOWED_KEYS = ["model", "prompt", "size", "n", "watermark"];
const LITE_ALLOWED_KEYS = [
  "model",
  "prompt",
  "size",
  "n",
  "watermark",
  "output_format",
  "response_format",
  "prompt_extend",
];

export function validateGenerationPayload(raw: unknown): ValidationIssue | null {
  if (typeof raw !== "object" || raw === null) {
    return { field: "body", message: "请求体必须是 JSON 对象" };
  }
  const body = raw as Record<string, unknown>;
  const model = body.model;
  if (model !== U1_FAST && model !== U1_LITE) {
    return { field: "model", message: "model 必须是 sensenova-u1-fast 或 sensenova-u1.5-lite" };
  }
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return { field: "prompt", message: "prompt 必填且去空格后不能为空" };
  }
  if (typeof body.watermark !== "boolean") {
    return { field: "watermark", message: "watermark 必须显式传入布尔值" };
  }
  const allowed = model === U1_FAST ? FAST_ALLOWED_KEYS : LITE_ALLOWED_KEYS;
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      return {
        field: key,
        message: `${model} 不支持参数 "${key}"，禁止发送未定义字段`,
      };
    }
  }
  if (model === U1_FAST && body.n !== undefined && body.n !== 1) {
    return { field: "n", message: "sensenova-u1-fast 当前仅生成 1 张" };
  }
  if (model === U1_LITE) {
    if (body.n !== undefined && body.n !== 1) {
      return { field: "n", message: "sensenova-u1.5-lite 仅支持 n=1" };
    }
    if (
      body.output_format !== undefined &&
      !OUTPUT_FORMATS.includes(body.output_format as OutputFormat)
    ) {
      return { field: "output_format", message: "output_format 仅支持 png | jpeg | webp" };
    }
    if (
      body.response_format !== undefined &&
      !RESPONSE_FORMATS.includes(body.response_format as ResponseFormat)
    ) {
      return { field: "response_format", message: "response_format 仅支持 b64_json | url" };
    }
  }
  if (body.size !== undefined && typeof body.size !== "string") {
    return { field: "size", message: "size 必须是字符串" };
  }
  return null;
}

export function validateEditPayload(raw: unknown): ValidationIssue | null {
  if (typeof raw !== "object" || raw === null) {
    return { field: "body", message: "请求体必须是 JSON 对象" };
  }
  const body = raw as Record<string, unknown>;
  if (body.model !== U1_LITE) {
    return { field: "model", message: "图片编辑仅支持 sensenova-u1.5-lite" };
  }
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return { field: "prompt", message: "编辑指令 prompt 必填且去空格后不能为空" };
  }
  if (typeof body.watermark !== "boolean") {
    return { field: "watermark", message: "watermark 必须显式传入布尔值" };
  }
  const images = body.images;
  if (!Array.isArray(images) || images.length === 0) {
    return { field: "images", message: "images 必填，且第一张为主编辑图" };
  }
  for (const item of images) {
    if (typeof item !== "object" || item === null) {
      return { field: "images", message: "images 每项必须是包含 image_url 的对象" };
    }
    const url = (item as Record<string, unknown>).image_url;
    if (typeof url !== "string" || (!isHttpUrl(url) && !isImageDataURL(url))) {
      return {
        field: "images",
        message: "image_url 仅支持完整公网 http/https 链接或 data:image/*;base64, 开头的 Data-URL",
      };
    }
  }
  if (body.n !== undefined && body.n !== 1) {
    return { field: "n", message: "图片编辑仅支持 n=1" };
  }
  if (
    body.response_format !== undefined &&
    !RESPONSE_FORMATS.includes(body.response_format as ResponseFormat)
  ) {
    return { field: "response_format", message: "response_format 仅支持 b64_json | url" };
  }
  if (body.prompt_extend !== undefined && typeof body.prompt_extend !== "boolean") {
    return { field: "prompt_extend", message: "prompt_extend 必须是布尔值" };
  }
  return null;
}
