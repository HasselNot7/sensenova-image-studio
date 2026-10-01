import { errorBody } from "@/lib/proxy-shared";
import { forwardToSensenova } from "@/lib/sensenova-server";
import { SENSENOVA_EDITS_PATH, SENSENOVA_GENERATIONS_PATH, validateSensenovaPayload } from "@/lib/sensenova";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorBody({ field: "body", message: "请求体必须是合法 JSON" });
  }

  const images = (body as { images?: unknown })?.images;
  const path = Array.isArray(images) && images.length > 0
    ? SENSENOVA_EDITS_PATH
    : SENSENOVA_GENERATIONS_PATH;

  const issue = validateSensenovaPayload(body, path);
  if (issue) {
    return errorBody(issue);
  }

  return forwardToSensenova(path, body, request);
}
