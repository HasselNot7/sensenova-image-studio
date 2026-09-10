import { SENSENOVA_BASE_URL } from "@/lib/models";
import type { ValidationIssue } from "@/lib/request-builder";

const UPSTREAM_TIMEOUT_MS = 180_000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 120_000;
const MODELS_TIMEOUT_MS = 30_000;

export interface ProxyError {
  type: string;
  code: string | number;
  message: string;
}

/**
 * BYOK 取密钥：优先请求头 x-sensenova-key（浏览器带的用户密钥），
 * 回退服务端环境变量 SENSENOVA_API_KEY（自托管单用户 / 桌面模式）。
 * 二者都没有返回 null。密钥绝不落盘、绝不写日志。
 */
export function resolveApiKey(request: Request): string | null {
  const header = request.headers.get("x-sensenova-key");
  if (header && header.trim().length > 0) {
    return header.trim();
  }
  const env = process.env.SENSENOVA_API_KEY;
  if (env && env.trim().length > 0) {
    return env.trim();
  }
  return null;
}

export function configMissingResponse(): Response {
  return Response.json(
    {
      error: {
        type: "config_error",
        code: "missing_api_key",
        message: "API key not provided",
      },
    },
    { status: 401 },
  );
}

export function errorBody(issue: ValidationIssue): Response {
  return Response.json(
    {
      error: {
        type: "invalid_request_error",
        code: `local_${issue.field}`,
        message: issue.message,
      },
    },
    { status: 400 },
  );
}

function detectMimeFromBase64Head(base64: string): string {
  const head = base64.slice(0, 24);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(head, "base64").subarray(0, 12));
  } catch {
    return "image/png";
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

async function downloadAsDataUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`不支持的图片链接协议：${url.slice(0, 32)}`);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`下载图片失败：HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = /^image\//.test(contentType) ? contentType : detectMimeFromBase64Head(buffer.toString("base64"));
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * 转发到 https://token.sensenova.cn/v1/{endpoint}，透传鉴权并把上游状态码/错误体返回前端。
 * 只要响应 data[] 里出现 url，就在服务端立即下载并转为 Data-URL（b64_json），
 * 规避 u1-fast 链接仅 1 小时、u1.5-lite 链接仅 24 小时的时效问题。
 */
export async function forwardToSensenova(
  endpoint: string,
  payload: unknown,
  apiKey: string | null,
): Promise<Response> {
  if (!apiKey) {
    return configMissingResponse();
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${SENSENOVA_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return Response.json(
      {
        error: {
          type: "internal_server_error",
          code: timedOut ? "upstream_timeout" : "proxy_fetch_failed",
          message: timedOut
            ? `上游请求超时（${UPSTREAM_TIMEOUT_MS / 1000} 秒），图像生成较慢，请稍后点击重试。原始错误：${message}`
            : `代理请求上游失败：${message}`,
        },
      } satisfies { error: ProxyError },
      { status: 500 },
    );
  }

  const status = upstream.status;
  const text = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (status < 200 || status >= 300) {
    const body =
      parsed && typeof parsed === "object" && "error" in parsed
        ? parsed
        : {
            error: {
              type: "internal_server_error",
              code: String(status),
              message: text.length > 0 ? text.slice(0, 500) : `上游返回 HTTP ${status}`,
            },
          };
    return Response.json(body, { status });
  }

  if (!parsed || typeof parsed !== "object") {
    return Response.json({
      error: {
        type: "internal_server_error",
        code: "upstream_parse_failed",
        message: "无法解析上游返回的 JSON",
      },
    } satisfies { error: ProxyError }, { status: 502 });
  }

  const json = parsed as { created?: unknown; data?: unknown };
  if (!Array.isArray(json.data)) {
    return Response.json(parsed);
  }

  const data: Record<string, unknown>[] = [];
  for (const item of json.data) {
    const record = item && typeof item === "object" ? { ...(item as Record<string, unknown>) } : {};
    if (typeof record.url === "string" && record.url.length > 0) {
      try {
        record.b64_json = await downloadAsDataUrl(record.url);
        delete record.url;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json(
          {
            error: {
              type: "failed_precondition_error",
              code: "image_download_failed",
              message: `上游已生成图片，但服务端下载临时链接失败（${message}）。链接会过期，请点击重试。`,
            },
          } satisfies { error: ProxyError },
          { status: 502 },
        );
      }
    } else if (typeof record.b64_json === "string" && record.b64_json.length > 0 && !record.b64_json.startsWith("data:")) {
      const mime = detectMimeFromBase64Head(record.b64_json);
      record.b64_json = `data:${mime};base64,${record.b64_json}`;
    }
    data.push(record);
  }

  return Response.json({
    created: typeof json.created === "number" ? json.created : Math.floor(Date.now() / 1000),
    data,
  });
}

/**
 * 代理 GET /v1/models（连通测试用）。按 header 优先、env 回退取到的 Key 透传，
 * 原样返回上游 JSON 与状态码；不下载、不转存、不记录密钥。
 */
export async function forwardModelsGet(apiKey: string | null): Promise<Response> {
  if (!apiKey) {
    return configMissingResponse();
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${SENSENOVA_BASE_URL}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        error: {
          type: "internal_server_error",
          code: "proxy_fetch_failed",
          message: `代理请求上游失败：${message}`,
        },
      } satisfies { error: ProxyError },
      { status: 500 },
    );
  }

  const status = upstream.status;
  const text = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (status < 200 || status >= 300) {
    const body =
      parsed && typeof parsed === "object" && "error" in parsed
        ? parsed
        : {
            error: {
              type: "internal_server_error",
              code: String(status),
              message: text.length > 0 ? text.slice(0, 500) : `上游返回 HTTP ${status}`,
            },
          };
    return Response.json(body, { status });
  }

  return Response.json(parsed ?? {});
}
