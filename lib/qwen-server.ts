import { QWEN_GENERATION_PATH, QWEN_IMAGE_3 } from "./models";
import {
  UPSTREAM_TIMEOUT_MS,
  VERIFY_TIMEOUT_MS,
  callUpstreamJson,
  configMissingResponse,
  jsonError,
  normalizeToDataUrls,
  passthroughError,
  resolveCredentials,
} from "./proxy-shared";
import { findProvider } from "./providers";

function provider() {
  const found = findProvider("qwen");
  if (!found) {
    throw new Error("providers.ts 里缺 qwen descriptor");
  }
  return found;
}

interface UpstreamContentItem {
  image?: unknown;
}

function collectImageUrls(parsed: unknown): string[] {
  const root = (parsed ?? {}) as {
    output?: { choices?: { message?: { content?: UpstreamContentItem[] } }[] };
  };
  const urls: string[] = [];
  for (const choice of root.output?.choices ?? []) {
    for (const item of choice.message?.content ?? []) {
      if (typeof item.image === "string" && item.image.length > 0) {
        urls.push(item.image);
      }
    }
  }
  return urls;
}

/**
 * 转发到 `${baseUrl}/services/aigc/multimodal-generation/generation`。
 * 上游非 2xx 原样带状态码回传；2xx 时把 output.choices[].content[].image 的
 * 24 小时临时链接在服务端下载转成 Data-URL，返回统一的 {created, data:[{b64_json}]}。
 */
export async function forwardToQwen(payload: unknown, request: Request): Promise<Response> {
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
      `${credentials.baseUrl}/${QWEN_GENERATION_PATH}`,
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

  const urls = collectImageUrls(call.parsed);
  if (urls.length === 0) {
    return jsonError(
      "InternalError",
      `上游返回 200 但没有图片链接（原始响应前 300 字：${call.text.slice(0, 300)}）`,
      502,
    );
  }
  return normalizeToDataUrls(urls);
}

/**
 * 免出图的连通性探测：故意发一条空 text 的请求。
 * 上游若先查鉴权 → 401/InvalidApiKey（密钥不可用）；若先查参数 → 400 InvalidParameter
 * （说明密钥已通过鉴权，且没真的花钱出图）。这是启发式判断，提示语里如实写明。
 */
export async function probeQwenKey(request: Request): Promise<Response> {
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
      `${credentials.baseUrl}/${QWEN_GENERATION_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: QWEN_IMAGE_3,
          input: { messages: [{ role: "user", content: [{ text: "" }] }] },
          parameters: { n: 1, watermark: false, prompt_extend: false },
        }),
      },
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
  const code = typeof body.code === "string" ? body.code : "";
  const authRejected =
    call.status === 401 ||
    call.status === 403 ||
    code === "InvalidApiKey" ||
    code === "NotAuthorize" ||
    code === "AccessDenied";

  return Response.json({
    ok: !authRejected,
    authRejected,
    httpStatus: call.status,
    code: code.length > 0 ? code : String(call.status),
    message:
      typeof body.message === "string"
        ? body.message
        : call.text.slice(0, 300) || `上游返回 HTTP ${call.status}`,
  });
}

