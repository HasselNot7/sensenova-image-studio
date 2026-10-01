import {
  AUTO_SIZE,
  CUSTOM_SIZE_VALUE,
  NEGATIVE_PROMPT_MAX_CHARS,
  QWEN_GENERATION_PATH,
  SEED_MAX,
  SEED_MIN,
  type PromptExtendMode,
} from "./models";
import { findModelById, findProvider } from "./providers";
import { buildGptImagePayload, validateGptImagePayload } from "./gpt-image";
import { buildSensenovaPayload, validateSensenovaPayload } from "./sensenova";

/** 用户补充与 SKILL 正文之间固定的分隔写法：让模型把它当追加指令，而不是正文的一部分。 */
export const USER_NOTE_HEADING = "## 用户本次补充要求";

export function assemblePrompt(skillBody: string, userNote: string): string {
  const note = userNote.trim();
  const body = skillBody.trim();
  if (note.length === 0) {
    return body;
  }
  return `${body}\n\n${USER_NOTE_HEADING}\n\n${note}`;
}

/** 与各服务商无关的内部请求描述；发给上游前由 buildProviderPayload 翻成各家线上格式。 */
export interface StudioRequest {
  providerId: string;
  model: string;
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

export interface StudioParams {
  providerId: string;
  model: string;
  prompt: string;
  images: string[];
  /** 最终发送给上游的尺寸（自定义时已解析为 WIDTHxHEIGHT） */
  size: string;
  n: number;
  negativePrompt: string;
  promptExtend: boolean;
  promptExtendMode: PromptExtendMode;
  enableThinking: boolean;
  watermark: boolean;
  /** 空串表示不发送 seed */
  seed: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export function buildStudioRequest(params: StudioParams): StudioRequest {
  const model = findModelById(params.model)?.model;
  const request: StudioRequest = {
    providerId: params.providerId,
    model: params.model,
    prompt: params.prompt.trim(),
    images: params.images.map((image) => image.trim()).filter((image) => image.length > 0),
    size: params.size,
    n: model && model.maxN === 1 ? 1 : params.n,
    negative_prompt: params.negativePrompt.trim(),
    prompt_extend: params.promptExtend,
    watermark: params.watermark,
  };
  if (model?.supportsPromptExtendMode && params.promptExtend) {
    request.prompt_extend_mode = params.promptExtendMode;
  }
  if (model?.supportsEnableThinking && params.promptExtend) {
    request.enable_thinking = params.enableThinking;
  }
  const seed = params.seed.trim();
  if (model?.supportsSeed && seed.length > 0) {
    request.seed = Number(seed);
  }
  return request;
}

export interface BuiltUpstreamCall {
  /** 相对服务商 base URL 的路径 */
  path: string;
  body: unknown;
}

/** 内部请求 → 各家线上请求体。 */
export function buildProviderPayload(request: StudioRequest): BuiltUpstreamCall {
  if (request.providerId === "sensenova") {
    const built = buildSensenovaPayload(request);
    return { path: built.path, body: built.body };
  }
  if (request.providerId === "openai") {
    const built = buildGptImagePayload(request);
    return { path: built.path, body: built.body };
  }
  return { path: QWEN_GENERATION_PATH, body: buildQwenPayload(request) };
}

/** 代理侧按服务商分别校验线上请求体。 */
export function validateProviderPayload(
  providerId: string,
  raw: unknown,
  path: string,
): ValidationIssue | null {
  if (providerId === "sensenova") {
    return validateSensenovaPayload(raw, path);
  }
  if (providerId === "openai") {
    return validateGptImagePayload(raw, path);
  }
  return validateQwenPayload(raw);
}

export function validateStudioParams(
  params: StudioParams & { customSize: string },
): ValidationIssue | null {
  const found = findModelById(params.model);
  if (!found) {
    return { field: "model", message: `未知模型 ${params.model}` };
  }
  if (!findProvider(params.providerId)) {
    return { field: "providerId", message: `未知服务商 ${params.providerId}` };
  }
  const { model } = found;
  if (params.prompt.trim().length === 0) {
    return { field: "prompt", message: "发送正文为空（无 Skill 要先写提示词，选了 Skill 则是装配失败）" };
  }
  if (params.images.length > 0 && !model.acceptsImages) {
    return { field: "images", message: `${model.id} 不支持输入图，请改用支持图生图的模型` };
  }
  if (params.images.length > model.maxInputImages) {
    return { field: "images", message: `${model.id} 最多接受 ${model.maxInputImages} 张输入图` };
  }
  for (const image of params.images) {
    if (
      !/^https?:\/\//i.test(image) &&
      !/^data:image\/[a-zA-Z0-9.+-]+;base64,[\s\S]+/.test(image)
    ) {
      return {
        field: "images",
        message: "输入图必须是 http(s):// 开头的完整公网链接，或 data:image/*;base64 开头的 Data-URL",
      };
    }
  }
  if (params.size === CUSTOM_SIZE_VALUE) {
    const error = model.validateSize(params.customSize);
    if (error) {
      return { field: "customSize", message: error };
    }
  } else if (params.size !== AUTO_SIZE) {
    const error = model.validateSize(params.size);
    if (error) {
      return { field: "size", message: error };
    }
  }
  if (params.n < 1 || params.n > model.maxN) {
    return { field: "n", message: `${model.id} 的 n 支持 1 ~ ${model.maxN}` };
  }
  if (
    model.supportsNegativePrompt &&
    params.negativePrompt.trim().length > NEGATIVE_PROMPT_MAX_CHARS
  ) {
    return {
      field: "negative_prompt",
      message: `negative_prompt 最长 ${NEGATIVE_PROMPT_MAX_CHARS} 字符，当前 ${params.negativePrompt.trim().length} 字符`,
    };
  }
  // 只校验真会被发出去的字段：关掉的开关对应控件是隐藏的，拿原始 UI 状态拦提交会把用户锁死
  if (params.providerId === "qwen" && params.promptExtend) {
    if (params.promptExtendMode === "agent" && params.images.length > 0) {
      return {
        field: "prompt_extend_mode",
        message: "prompt_extend_mode=agent（APE）只支持文生图，带输入图时上游返回 400",
      };
    }
  }
  const seed = params.seed.trim();
  if (model.supportsSeed && seed.length > 0) {
    const value = Number(seed);
    if (!Number.isInteger(value) || value < SEED_MIN || value > SEED_MAX) {
      return { field: "seed", message: `seed 必须是 ${SEED_MIN} ~ ${SEED_MAX} 之间的整数` };
    }
  }
  return null;
}

/* ---------------- 千问（阿里云百炼）线上格式 ---------------- */

export interface QwenPayload {
  model: string;
  input: { messages: { role: "user"; content: Record<string, string>[] }[] };
  parameters: Record<string, string | number | boolean>;
}

/**
 * 内部扁平结构 → DashScope 线上请求体。
 * content 顺序固定为「输入图… → text」：上游按最后一张图定画面比例，正文必须恰好一条。
 */
export function buildQwenPayload(request: StudioRequest): QwenPayload {
  const content: Record<string, string>[] = request.images.map((image) => ({ image }));
  content.push({ text: request.prompt });

  const parameters: Record<string, string | number | boolean> = {
    n: request.n,
    watermark: request.watermark,
    prompt_extend: request.prompt_extend,
  };
  // 上游实测不接受字面量 "auto"（InvalidParameter: Expected format '<width>*<height>'），
  // 所以界面上的 auto = 干脆不发 size，让模型按默认 / 输入图决定。
  if (request.size !== AUTO_SIZE) {
    parameters.size = request.size;
  }
  const negative = request.negative_prompt.trim();
  if (negative.length > 0) {
    parameters.negative_prompt = negative;
  }
  if (request.prompt_extend_mode !== undefined) {
    parameters.prompt_extend_mode = request.prompt_extend_mode;
  }
  if (request.enable_thinking !== undefined) {
    parameters.enable_thinking = request.enable_thinking;
  }
  if (request.seed !== undefined) {
    parameters.seed = request.seed;
  }
  return {
    model: request.model,
    input: { messages: [{ role: "user", content }] },
    parameters,
  };
}

const ROOT_KEYS = ["model", "input", "parameters"];
const PARAMETER_KEYS = [
  "n",
  "size",
  "negative_prompt",
  "prompt_extend",
  "prompt_extend_mode",
  "enable_thinking",
  "watermark",
  "seed",
];

/** 服务端二次校验：前端绕过或手搓 curl 打本站代理时同样兜住。 */
export function validateQwenPayload(raw: unknown): ValidationIssue | null {
  if (typeof raw !== "object" || raw === null) {
    return { field: "body", message: "请求体必须是 JSON 对象" };
  }
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!ROOT_KEYS.includes(key)) {
      return { field: key, message: `顶层不支持字段 "${key}"，只允许 model / input / parameters` };
    }
  }
  const found = findModelById(typeof body.model === "string" ? body.model : "");
  if (!found || found.provider.id !== "qwen") {
    return { field: "model", message: "model 必须是本服务商支持的千问图像模型" };
  }
  const { model } = found;
  const input = body.input as { messages?: unknown } | undefined;
  if (!input || typeof input !== "object" || !Array.isArray(input.messages)) {
    return { field: "input.messages", message: "input.messages 必须是数组" };
  }
  if (input.messages.length !== 1) {
    return { field: "input.messages", message: "当前只支持单轮，input.messages 必须只有 1 个元素" };
  }
  const message = input.messages[0] as { role?: unknown; content?: unknown };
  if (message.role !== "user") {
    return { field: "input.messages[0].role", message: "role 必须是 user" };
  }
  if (!Array.isArray(message.content) || message.content.length === 0) {
    return { field: "content", message: "content 必须是非空数组" };
  }
  let textCount = 0;
  let imageCount = 0;
  for (const item of message.content) {
    if (typeof item !== "object" || item === null) {
      return { field: "content", message: "content 每项必须是 {text} 或 {image} 对象" };
    }
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== 1) {
      return { field: "content", message: "content 每项只能有一个键（text 或 image）" };
    }
    if ("text" in record) {
      textCount += 1;
      if (typeof record.text !== "string" || record.text.trim().length === 0) {
        return { field: "text", message: "text 必填且去空格后不能为空" };
      }
    } else if ("image" in record) {
      imageCount += 1;
      const value = record.image;
      if (
        typeof value !== "string" ||
        (!/^https?:\/\//i.test(value) && !/^data:image\/[a-zA-Z0-9.+-]+;base64,[\s\S]+/.test(value))
      ) {
        return {
          field: "image",
          message: "image 仅支持公网 http(s) 链接或 data:image/*;base64, 开头的 Data-URL",
        };
      }
    } else {
      return { field: "content", message: `content 出现未知键 ${keys[0]}，只允许 text 或 image` };
    }
  }
  if (textCount !== 1) {
    return { field: "text", message: "content 必须包含恰好 1 个 text 对象" };
  }
  if (imageCount > model.maxInputImages) {
    return { field: "image", message: `${model.id} 最多 ${model.maxInputImages} 张输入图` };
  }

  const parameters = body.parameters as Record<string, unknown> | undefined;
  if (parameters) {
    for (const key of Object.keys(parameters)) {
      if (!PARAMETER_KEYS.includes(key)) {
        return { field: key, message: `parameters 不支持 "${key}"` };
      }
    }
    if (parameters.n !== undefined) {
      const n = parameters.n;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > model.maxN) {
        return { field: "n", message: `n 必须是 1 ~ ${model.maxN} 的整数` };
      }
    }
    if (parameters.size !== undefined) {
      const size = parameters.size;
      if (typeof size !== "string") {
        return { field: "size", message: "size 必须是字符串" };
      }
      if (size === AUTO_SIZE) {
        return {
          field: "size",
          message:
            "上游不接受字面量 \"auto\"（实测 InvalidParameter: Expected format '<width>*<height>'），要模型默认就别发 size 字段",
        };
      }
      const sizeError = model.validateSize(size);
      if (sizeError) {
        return { field: "size", message: sizeError };
      }
    }
    if (
      parameters.negative_prompt !== undefined &&
      typeof parameters.negative_prompt === "string" &&
      parameters.negative_prompt.length > NEGATIVE_PROMPT_MAX_CHARS
    ) {
      return {
        field: "negative_prompt",
        message: `negative_prompt 最长 ${NEGATIVE_PROMPT_MAX_CHARS} 字符`,
      };
    }
    for (const boolKey of ["prompt_extend", "enable_thinking", "watermark"]) {
      if (parameters[boolKey] !== undefined && typeof parameters[boolKey] !== "boolean") {
        return { field: boolKey, message: `${boolKey} 必须是布尔值` };
      }
    }
    if (parameters.prompt_extend_mode !== undefined) {
      if (!model.supportsPromptExtendMode) {
        return { field: "prompt_extend_mode", message: `${model.id} 不支持 prompt_extend_mode` };
      }
      if (parameters.prompt_extend_mode !== "direct" && parameters.prompt_extend_mode !== "agent") {
        return { field: "prompt_extend_mode", message: "prompt_extend_mode 仅支持 direct | agent" };
      }
      if (parameters.prompt_extend_mode === "agent" && imageCount > 0) {
        return { field: "prompt_extend_mode", message: "agent（APE）只支持文生图，带输入图会返回 400" };
      }
    }
    if (parameters.enable_thinking !== undefined) {
      if (!model.supportsEnableThinking) {
        return { field: "enable_thinking", message: `${model.id} 不支持 enable_thinking` };
      }
      if (parameters.enable_thinking === true && parameters.prompt_extend !== true) {
        return { field: "enable_thinking", message: "enable_thinking 需要 prompt_extend=true" };
      }
    }
    if (parameters.seed !== undefined) {
      const seed = parameters.seed;
      if (typeof seed !== "number" || !Number.isInteger(seed) || seed < SEED_MIN || seed > SEED_MAX) {
        return { field: "seed", message: `seed 必须是 ${SEED_MIN} ~ ${SEED_MAX} 的整数` };
      }
    }
  }
  return null;
}
