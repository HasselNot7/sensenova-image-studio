import { errorBody, forwardToSensenova } from "@/lib/sensenova-server";
import { validateEditPayload } from "@/lib/request-builder";

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

  const issue = validateEditPayload(body);
  if (issue) {
    return errorBody(issue);
  }

  return forwardToSensenova("images/edits", body);
}
