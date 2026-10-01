import { buildProviderHeaders } from "@/lib/browser-config";
import { parseUpstreamError, type ApiFailure } from "@/lib/errors";
import { buildDistillHeaders, getDistillConfig } from "@/lib/browser-config";
import { findProvider } from "@/lib/providers";
import { buildDistillPayload, distillTargetTokens, stripCodeFence } from "@/lib/distill";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export type ApiSuccess = {
  ok: true;
  /** 代理已保证每一项都是可长期保存的 Data-URL */
  images: string[];
  created: number;
};

export type ApiError = {
  ok: false;
  failure: ApiFailure;
};

export type ApiResult = ApiSuccess | ApiError;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 缺密钥 / 鉴权失败时触发，由 Workspace 监听后弹出设置弹窗。
 * detail 带上是哪个服务商，弹窗直接滚到对应小节。
 */
export function requestOpenSettings(providerId?: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("studio:need-key", { detail: { providerId } }));
  }
}

export interface FetchJson {
  status: number;
  ok: boolean;
  payload: unknown;
}

/** 统一的同源代理请求：按服务商 descriptor 声明的头名带上浏览器里存的配置。 */
export async function providerFetch(
  providerId: string,
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; keyOverride?: string } = {},
): Promise<FetchJson> {
  const provider = findProvider(providerId);
  if (!provider) {
    throw new Error(`未知服务商 ${providerId}`);
  }
  const response = await fetch(path, {
    method: opts.method ?? "GET",
    headers: buildProviderHeaders(provider, opts.keyOverride),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, ok: response.ok, payload };
}

async function imageOnce(providerId: string, body: unknown): Promise<ApiResult> {
  const provider = findProvider(providerId);
  if (!provider) {
    throw new Error(`未知服务商 ${providerId}`);
  }
  const { status, ok, payload } = await providerFetch(providerId, provider.generationPath, {
    method: "POST",
    body,
  });

  if (ok) {
    const data = (payload ?? {}) as { created?: number; data?: unknown };
    const images = (Array.isArray(data.data) ? data.data : [])
      .map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        return typeof record.b64_json === "string" ? record.b64_json : "";
      })
      .filter((image) => image.length > 0);
    if (images.length === 0) {
      return {
        ok: false,
        failure: {
          type: "InternalError",
          code: "empty_result",
          message: "代理未返回图片数据（data[].b64_json 为空）",
          hint: "服务器内部错误，请点击重试。",
          retryable: true,
        },
      };
    }
    return {
      ok: true,
      images,
      created: typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000),
    };
  }

  const failure = parseUpstreamError(payload, status);
  if (failure.type === "config_error" || status === 401 || status === 403) {
    requestOpenSettings(providerId);
  }
  return { ok: false, failure };
}

/**
 * 走同源代理出图（BYOK）。限流（Throttling / 429）按 1s / 2s / 4s 指数退避自动重试，最多 3 次。
 */
export async function requestProviderImage(providerId: string, body: unknown): Promise<ApiResult> {
  let attempt = 0;
  while (true) {
    let result: ApiResult;
    try {
      result = await imageOnce(providerId, body);
    } catch (error) {
      return {
        ok: false,
        failure: {
          type: "network_error",
          code: "fetch_failed",
          message: error instanceof Error ? error.message : String(error),
          hint: "无法连接后端代理，请确认服务正在运行。",
          retryable: true,
        },
      };
    }

    if (result.ok) {
      return result;
    }
    const failure = result.failure;
    const shouldRetry =
      (failure.code.startsWith("Throttling") || failure.code === "429") && attempt < MAX_RETRIES;
    if (shouldRetry) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      attempt += 1;
      continue;
    }
    return result;
  }
}

/** 设置界面里的「测试连通」：用输入框当前值探测，不出图、不产生费用。 */
export async function verifyProviderKey(
  providerId: string,
  keyOverride?: string,
): Promise<FetchJson> {
  const provider = findProvider(providerId);
  if (!provider?.verifyPath) {
    throw new Error("该服务商暂不支持免出图连通性探测");
  }
  return providerFetch(providerId, provider.verifyPath, {
    method: "POST",
    body: {},
    ...(keyOverride && keyOverride.trim().length > 0 ? { keyOverride } : {}),
  });
}

export type DistillResult =
  | { ok: true; text: string; originalChars: number }
  | { ok: false; failure: ApiFailure };

/**
 * 出图前把 SKILL 原文交给蒸馏模型压缩。
 * 失败一律如实返回，绝不悄悄退回全文——那会让用户以为发出去的是短版。
 */
export async function requestDistill(input: {
  skillBody: string;
  userNote: string;
  modelLimit: number | null;
  promptLimitUnit?: "tokens" | "chars";
}): Promise<DistillResult> {
  const config = getDistillConfig();
  const target = distillTargetTokens(input.modelLimit, config.targetTokens);
  if (target === null) {
    return {
      ok: false,
      failure: {
        type: "config_error",
        code: "missing_target",
        message: "该图像模型官方未标注提示词上限，蒸馏目标 token 需要你在设置里手填",
        hint: "请在「设置 · 蒸馏模型」里填目标 token 上限",
        retryable: false,
      },
    };
  }
  const payload = buildDistillPayload({
    model: config.model,
    targetTokens: target,
    unit: input.promptLimitUnit ?? "tokens",
    skillBody: input.skillBody,
    userNote: input.userNote,
  });
  const response = await fetch("/api/distill", {
    method: "POST",
    headers: buildDistillHeaders(config),
    body: JSON.stringify(payload),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const failure = parseUpstreamError(parsed, response.status);
    if (failure.type === "config_error" || response.status === 401) {
      requestOpenSettings("distill");
    }
    return { ok: false, failure };
  }
  const text = stripCodeFence(String((parsed as { text?: unknown })?.text ?? ""));
  if (text.length === 0) {
    return {
      ok: false,
      failure: {
        type: "InternalError",
        code: "empty_distill",
        message: "蒸馏模型没返回正文",
        hint: "出图已中止，未发送任何提示词。可换模型或改回全文直发。",
        retryable: true,
      },
    };
  }
  return { ok: true, text, originalChars: input.skillBody.length };
}
