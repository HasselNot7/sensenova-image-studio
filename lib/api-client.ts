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

/**
 * 通过同源后端代理调用 SenseNova。
 * 429（quota_exceeded_error）走指数退避自动重试：1s / 2s / 4s，最多 3 次。
 */
export async function requestSensenovaImage(
  path: "/api/sensenova/generations" | "/api/sensenova/edits",
  body: unknown,
): Promise<ApiResult> {
  let attempt = 0;
  while (true) {
    let response: Response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
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

    const failure = parseUpstreamError(payload, response.status);
    const shouldRetry =
      (failure.type === "quota_exceeded_error" || response.status === 429) &&
      attempt < MAX_RETRIES;
    if (shouldRetry) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      attempt += 1;
      continue;
    }
    return { ok: false, failure };
  }
}
