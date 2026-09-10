import { getStoredApiKey } from "@/lib/api-key";
import { parseUpstreamError, type ApiFailure } from "@/lib/errors";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export type ApiSuccess = {
  ok: true;
  /** 服务端已保证是可长期保存的 Data-URL */
  image: string;
  created: number;
};

export type ApiError = {
  ok: false;
  failure: ApiFailure;
};

export type ApiResult = ApiSuccess | ApiError;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 触发「需要密钥」事件，由 Workspace 监听后弹出设置弹窗。 */
export function requestOpenSettings(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sensenova:need-key"));
  }
}

export type FetchJson = {
  status: number;
  ok: boolean;
  payload: unknown;
};

/**
 * 统一的 SenseNova 代理请求：自动带上 localStorage 里的用户密钥（x-sensenova-key）。
 * keyOverride 用于「测试连通」时以输入框当前值发送。
 */
export async function sensenovaFetch(
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; keyOverride?: string } = {},
): Promise<FetchJson> {
  const key = (opts.keyOverride ?? getStoredApiKey()).trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key.length > 0) {
    headers["x-sensenova-key"] = key;
  }
  const response = await fetch(path, {
    method: opts.method ?? "GET",
    headers,
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

async function imageOnce(
  path: "/api/sensenova/generations" | "/api/sensenova/edits",
  body: unknown,
): Promise<ApiResult> {
  const { status, ok, payload } = await sensenovaFetch(path, { method: "POST", body });

  if (ok) {
    const data = (payload as { created?: number; data?: unknown }) ?? {};
    const list = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
    const first = list[0] ?? {};
    const image = typeof first.b64_json === "string" ? first.b64_json : "";
    if (image.length === 0) {
      return {
        ok: false,
        failure: {
          type: "internal_server_error",
          code: "empty_result",
          message: "代理未返回图片数据（data[0].b64_json 为空）",
          hint: "服务器内部错误，请点击重试。",
          retryable: true,
        },
      };
    }
    return {
      ok: true,
      image,
      created: typeof data.created === "number" ? data.created : Math.floor(Date.now() / 1000),
    };
  }

  const failure = parseUpstreamError(payload, status);
  // 缺密钥 / 鉴权失败：引导用户打开设置填写自己的 Key
  if (failure.type === "config_error" || status === 401) {
    requestOpenSettings();
  }
  return { ok: false, failure };
}

/**
 * 通过同源后端代理调用 SenseNova（BYOK：请求头带用户密钥）。
 * 429（quota_exceeded_error）走指数退避自动重试：1s / 2s / 4s，最多 3 次；重试同样带头。
 */
export async function requestSensenovaImage(
  path: "/api/sensenova/generations" | "/api/sensenova/edits",
  body: unknown,
): Promise<ApiResult> {
  let attempt = 0;
  while (true) {
    let result: ApiResult;
    try {
      result = await imageOnce(path, body);
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
      (failure.type === "quota_exceeded_error" || failure.code === "429") && attempt < MAX_RETRIES;
    if (shouldRetry) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      attempt += 1;
      continue;
    }
    return result;
  }
}
