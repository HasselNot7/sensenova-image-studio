import { configMissingResponse, errorBody, forwardToSensenova, resolveApiKey } from "@/lib/sensenova-server";
import { validateGenerationPayload } from "@/lib/request-builder";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: {
          type: "invalid_request_error",
          code: "invalid_json",
          message: "请求体必须是合法 JSON",
        },
      },
      { status: 400 },
    );
  }

  const issue = validateGenerationPayload(body);
  if (issue) {
    return errorBody(issue);
  }

  const apiKey = resolveApiKey(request);
  if (!apiKey) {
    return configMissingResponse();
  }

  return forwardToSensenova("images/generations", body, apiKey);
}
