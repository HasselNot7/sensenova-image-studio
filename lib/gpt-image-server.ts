import {
  UPSTREAM_TIMEOUT_MS,
  VERIFY_TIMEOUT_MS,
  callUpstreamJson,
  configMissingResponse,
  detectMimeFromBase64Head,
  jsonError,
  passthroughError,
  resolveCredentials,
} from "./proxy-shared";
import { findProvider } from "./providers";

function provider() {
  const found = findProvider("openai");
  if (!found) {
    throw new Error("providers.ts 里缺 openai descriptor");
  }
  return found;
}

/**
 * 转发到 `${GPT_IMAGE_BASE_URL}/${path}`（images/generations 或 images/edits）。
 * GPT image 模型没有 response_format 参数，官方规范写明「always return base64-encoded
 * images」，所以这里不需要像 SenseNova 那样下载临时链接。
 */
export async function forwardToGptImage(
  path: string,
  payload: unknown,
  request: Request,
): Promise<Response> {
  const credentials = resolveCredentials(request, provider());
  if (!credentials.apiKey) {
    return configMissingResponse(provider());
  }
  if (!credentials.baseUrl) {
    return jsonError("invalid_request_error", credentials.error ?? "无法确定上游地址", 400);
  }

  let call;
  try {
    call = await callUpstreamJson(
      `${credentials.baseUrl}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      UPSTREAM_TIMEOUT_MS,
    );
  } catch (error) {
    return jsonError(
      (error as { code?: string })?.code ?? "proxy_fetch_failed",
      error instanceof Error ? error.message : String(error),
      (error as { status?: number })?.status ?? 500,
    );
  }

  const failed = passthroughError(call);
  if (failed) {
    return failed;
  }

  const root = (call.parsed ?? {}) as { created?: unknown; data?: unknown };
  const items = Array.isArray(root.data) ? (root.data as { b64_json?: unknown }[]) : [];
  const data: { b64_json: string }[] = [];
  for (const item of items) {
    if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
      data.push({
        b64_json: item.b64_json.startsWith("data:")
          ? item.b64_json
          : `data:${detectMimeFromBase64Head(item.b64_json)};base64,${item.b64_json}`,
      });
    }
  }
  if (data.length === 0) {
    return jsonError(
      "api_error",
      `上游返回 200 但没有图片数据（原始响应前 300 字：${call.text.slice(0, 300)}）`,
      502,
    );
  }
  return Response.json({
    created: typeof root.created === "number" ? root.created : Math.floor(Date.now() / 1000),
    data,
  });
}

/** 连通性探测：GET /models，2xx 即密钥可用，不产生出图费用。 */
export async function verifyGptImageKey(request: Request): Promise<Response> {
  const credentials = resolveCredentials(request, provider());
  if (!credentials.apiKey) {
    return configMissingResponse(provider());
  }
  if (!credentials.baseUrl) {
    return jsonError("invalid_request_error", credentials.error ?? "无法确定上游地址", 400);
  }
  let call;
  try {
    call = await callUpstreamJson(
      `${credentials.baseUrl}/models`,
      { method: "GET", headers: { Authorization: `Bearer ${credentials.apiKey}` } },
      VERIFY_TIMEOUT_MS,
    );
  } catch (error) {
    return jsonError(
      (error as { code?: string })?.code ?? "proxy_fetch_failed",
      error instanceof Error ? error.message : String(error),
      (error as { status?: number })?.status ?? 500,
    );
  }
  const body =
    call.parsed && typeof call.parsed === "object" ? (call.parsed as Record<string, unknown>) : {};
  const err = (body.error ?? {}) as Record<string, unknown>;
  const authRejected =
    call.status === 401 ||
    call.status === 403 ||
    typeof err.type === "string" ||
    typeof body.code === "string";

  return Response.json({
    ok: !authRejected,
    authRejected,
    httpStatus: call.status,
    code:
      typeof body.code === "string"
        ? body.code
        : typeof err.type === "string"
          ? err.type
          : String(call.status),
    message:
      typeof err.message === "string"
        ? err.message
        : typeof body.message === "string"
          ? body.message
          : call.text.slice(0, 300) || `上游返回 HTTP ${call.status}`,
  });
}
