import { errorBody } from "@/lib/proxy-shared";
import { forwardToGptImage } from "@/lib/gpt-image-server";
import {
  GPT_IMAGE_EDITS_PATH,
  GPT_IMAGE_GENERATIONS_PATH,
  validateGptImagePayload,
} from "@/lib/gpt-image";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorBody({ field: "body", message: "请求体必须是合法 JSON" });
  }

  const images = (body as { images?: unknown })?.images;
  const path =
    Array.isArray(images) && images.length > 0
      ? GPT_IMAGE_EDITS_PATH
      : GPT_IMAGE_GENERATIONS_PATH;

  const issue = validateGptImagePayload(body, path);
  if (issue) {
    return errorBody(issue);
  }

  return forwardToGptImage(path, body, request);
}
