import type { ProviderDescriptor } from "./providers";
import { resolveProviderBaseUrl } from "./providers";

export const UPSTREAM_TIMEOUT_MS = 300_000;
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 120_000;
export const VERIFY_TIMEOUT_MS = 30_000;

export interface ProxyError {
  code: string;
  message: string;
}

export function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ProxyError, { status });
}

export function configMissingResponse(provider: ProviderDescriptor): Response {
  return jsonError(
    "config_error",
    `未提供 ${provider.shortName} API 密钥（请求头 ${provider.keyHeader} 与服务端 ${provider.keyEnv} 都为空）`,
    401,
  );
}

export function errorBody(issue: { field: string; message: string }): Response {
  return jsonError("InvalidParameter", `${issue.field}：${issue.message}`, 400);
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export interface ResolvedCredentials {
  apiKey: string | null;
  baseUrl: string | null;
  error: string | null;
}

/**
 * BYOK：请求头优先（浏览器里用户自己的密钥），回退服务端环境变量。
 * 区域 / 业务空间等专属字段同样头优先。密钥绝不落盘、绝不写日志。
 */
export function resolveCredentials(
  request: Request,
  provider: ProviderDescriptor,
): ResolvedCredentials {
  const apiKey = firstNonEmpty(request.headers.get(provider.keyHeader), process.env[provider.keyEnv]);
  const values: Record<string, string> = {};
  for (const field of provider.fields) {
    values[field.id] = firstNonEmpty(
      request.headers.get(field.header),
      field.env ? process.env[field.env] : undefined,
      field.defaultValue,
    );
  }
  const { baseUrl, error } = resolveProviderBaseUrl(provider.id, values);
  return { apiKey: apiKey.length > 0 ? apiKey : null, baseUrl, error };
}

export function detectMimeFromBase64Head(base64: string): string {
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

/** 上游给的都是会过期的临时链接，代理一律下载转成 Data-URL 再回前端。 */
export async function downloadAsDataUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`不支持的图片链接协议：${url.slice(0, 32)}`);
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`下载图片失败：HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = /^image\//.test(contentType)
    ? contentType
    : detectMimeFromBase64Head(buffer.toString("base64"));
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export class ProxyCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProxyCallError";
  }
}

export interface UpstreamJson {
  status: number;
  parsed: unknown;
  text: string;
}

export async function callUpstreamJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutCode = "Timeout",
): Promise<UpstreamJson> {
  let upstream: Response;
  try {
    upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    throw new ProxyCallError(
      timedOut ? timeoutCode : "proxy_fetch_failed",
      timedOut
        ? `上游请求超时（${timeoutMs / 1000} 秒），长正文出图较慢，请稍后重试。原始错误：${message}`
        : `代理请求上游失败：${message}`,
      timedOut ? 504 : 500,
    );
  }
  const text = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: upstream.status, parsed, text };
}

/** 非 2xx 时把上游错误体原样回传（DashScope 用 {code,message}，OpenAI 风格用 {error:{...}}）。 */
export function passthroughError(call: UpstreamJson): Response | null {
  if (call.status >= 200 && call.status < 300) {
    return null;
  }
  const body =
    call.parsed && typeof call.parsed === "object" ? (call.parsed as Record<string, unknown>) : null;
  if (body && (typeof body.code === "string" || body.error !== undefined)) {
    return Response.json(body, { status: call.status });
  }
  return jsonError(
    String(call.status),
    call.text.length > 0 ? call.text.slice(0, 500) : `上游返回 HTTP ${call.status}`,
    call.status,
  );
}

/** 把一组临时图片链接转成 {created, data:[{b64_json}]}。 */
export async function normalizeToDataUrls(
  urls: string[],
): Promise<Response> {
  const data: { b64_json: string }[] = [];
  for (const url of urls) {
    try {
      data.push({ b64_json: await downloadAsDataUrl(url) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(
        "TaskFailed",
        `上游已生成图片，但服务端下载临时链接失败（${message}）。链接会过期，请点击重试。`,
        502,
      );
    }
  }
  return Response.json({ created: Math.floor(Date.now() / 1000), data });
}
