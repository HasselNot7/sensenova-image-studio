import { getKeySource, setRuntimeApiKey } from "@/lib/server-key";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { type: "invalid_request_error", code: "invalid_json", message: "请求体必须是合法 JSON" } },
      { status: 400 },
    );
  }
  const payload = (body ?? {}) as { apiKey?: unknown; clear?: unknown };

  if (payload.clear === true) {
    setRuntimeApiKey(null);
    return Response.json({ ok: true, source: getKeySource() });
  }

  const key = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
  if (!/^sk-\S{6,}$/.test(key)) {
    return Response.json(
      {
        error: {
          type: "invalid_request_error",
          code: "invalid_key_format",
          message: "密钥格式不正确：应为 sk- 开头的 SenseNova API Key（在 platform.sensenova.cn 控制台创建）",
        },
      },
      { status: 400 },
    );
  }
  setRuntimeApiKey(key);
  return Response.json({ ok: true, source: getKeySource() });
}
