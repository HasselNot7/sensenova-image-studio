import { forwardDistill } from "@/lib/distill-server";
import { errorBody } from "@/lib/proxy-shared";

export const maxDuration = 180;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorBody({ field: "body", message: "请求体必须是合法 JSON" });
  }

  const record = (body ?? {}) as { model?: unknown; messages?: unknown };
  if (typeof record.model !== "string" || record.model.trim().length === 0) {
    return errorBody({ field: "model", message: "蒸馏模型名不能为空" });
  }
  if (!Array.isArray(record.messages) || record.messages.length === 0) {
    return errorBody({ field: "messages", message: "messages 不能为空" });
  }

  return forwardDistill(body as never, request);
}
