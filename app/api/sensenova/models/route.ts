import { forwardModelsGet, resolveApiKey } from "@/lib/sensenova-server";

export async function GET(request: Request): Promise<Response> {
  const apiKey = resolveApiKey(request);
  return forwardModelsGet(apiKey);
}
