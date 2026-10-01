import {
  UPSTREAM_TIMEOUT_MS,
  VERIFY_TIMEOUT_MS,
  callUpstreamJson,
  configMissingResponse,
  detectMimeFromBase64Head,
  downloadAsDataUrl,
  jsonError,
  passthroughError,
  resolveCredentials,
} from "./proxy-shared";
import { findProvider } from "./providers";

function provider() {
  const found = findProvider("sensenova");
  if (!found) {
    throw new Error("providers.ts 里缺 sensenova descriptor");
  }
  return found;
}

interface DataItem {
  url?: unknown;
  b64_json?: unknown;
}

/**
 * 转发到 `${SENSENOVA_BASE_URL}/${path}`（images/generations 或 images/edits）。
 * 响应 data[] 里出现 url（u1-fast 1 小时、u1.5-lite 24 小时过期）就在服务端下载转 Data-URL，
 * 返回与千问代理一致的 {created, data:[{b64_json}]}。
 */
export async function forwardToSensenova(
  path: string,
  payload: unknown,
  request: Request,
): Promise<Response> {
  const credentials = resolveCredentials(request, provider());
  if (!credentials.apiKey) {
    return configMissingResponse(provider());
  }
  if (!credentials.baseUrl) {
    return jsonError("InvalidParameter", credentials.error ?? "无法确定上游地址", 400);
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
  const items = Array.isArray(root.data) ? (root.data as DataItem[]) : [];
  const data: { b64_json: string }[] = [];
  for (const item of items) {
    if (typeof item.url === "string" && item.url.length > 0) {
      try {
        data.push({ b64_json: await downloadAsDataUrl(item.url) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonError(
          "TaskFailed",
          `上游已生成图片，但服务端下载临时链接失败（${message}）。链接会过期，请点击重试。`,
          502,
        );
      }
    } else if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
      data.push({
        b64_json: item.b64_json.startsWith("data:")
          ? item.b64_json
          : `data:${detectMimeFromBase64Head(item.b64_json)};base64,${item.b64_json}`,
      });
    }
  }
  if (data.length === 0) {
    return jsonError(
      "InternalError",
      `上游返回 200 但没有图片数据（原始响应前 300 字：${call.text.slice(0, 300)}）`,
      502,
    );
  }
  return Response.json({
    created: typeof root.created === "number" ? root.created : Math.floor(Date.now() / 1000),
    data,
  });
}

/** 连通性探测：GET /v1/models，2xx 即密钥可用，不产生出图费用。 */
export async function verifySensenovaKey(request: Request): Promise<Response> {
  const credentials = resolveCredentials(request, provider());
  if (!credentials.apiKey) {
    return configMissingResponse(provider());
  }
  if (!credentials.baseUrl) {
    return jsonError("InvalidParameter", credentials.error ?? "无法确定上游地址", 400);
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
