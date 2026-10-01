import { errorBody } from "@/lib/proxy-shared";
import { forwardToQwen } from "@/lib/qwen-server";
import { validateQwenPayload } from "@/lib/request-builder";

/** 长正文 + 高分辨率出图可能跑到几分钟，放开 Next 路由的执行时长上限。 */
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorBody({ field: "body", message: "请求体必须是合法 JSON" });
  }

  const issue = validateQwenPayload(body);
  if (issue) {
    return errorBody(issue);
  }

  return forwardToQwen(body, request);
}
