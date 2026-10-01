import { callUpstreamJson, jsonError, passthroughError } from "./proxy-shared";
import type { DistillChatPayload } from "./distill";
import { parseDistillReply } from "./distill";

const DISTILL_TIMEOUT_MS = 300_000;

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export interface DistillCredentials {
  baseUrl: string | null;
  apiKey: string | null;
  error: string | null;
}

/** base 与密钥同样是请求头优先、服务端环境变量回退。 */
export function resolveDistillCredentials(request: Request): DistillCredentials {
  const base = firstNonEmpty(request.headers.get("x-distill-base"), process.env.DISTILL_BASE_URL);
  const apiKey = firstNonEmpty(request.headers.get("x-distill-key"), process.env.DISTILL_API_KEY);
  if (base.length === 0) {
    return { baseUrl: null, apiKey: apiKey.length > 0 ? apiKey : null, error: "没配蒸馏模型的 base URL（设置 · 蒸馏模型）" };
  }
  if (!/^https?:\/\//i.test(base)) {
    return { baseUrl: null, apiKey: apiKey.length > 0 ? apiKey : null, error: `base URL 必须是 http(s) 地址，当前「${base.slice(0, 60)}」` };
  }
  if (apiKey.length === 0) {
    return { baseUrl: null, apiKey: null, error: "没配蒸馏模型的 API 密钥" };
  }
  return { baseUrl: base.replace(/\/+$/, ""), apiKey, error: null };
}

/** 调 OpenAI 兼容的 /chat/completions 把 SKILL 蒸馏成短提示词。 */
export async function forwardDistill(
  payload: DistillChatPayload,
  request: Request,
): Promise<Response> {
  const credentials = resolveDistillCredentials(request);
  if (!credentials.baseUrl || !credentials.apiKey) {
    return jsonError("config_error", credentials.error ?? "蒸馏模型未配置", 401);
  }

  let call;
  try {
    call = await callUpstreamJson(
      `${credentials.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      DISTILL_TIMEOUT_MS,
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

  const text = parseDistillReply(call.parsed);
  if (text.length === 0) {
    return jsonError(
      "InternalError",
      `蒸馏模型返回 200 但没有正文（原始响应前 300 字：${call.text.slice(0, 300)}）`,
      502,
    );
  }
  return Response.json({ text, model: payload.model, created: Math.floor(Date.now() / 1000) });
}

