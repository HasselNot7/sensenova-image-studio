import { probeQwenKey } from "@/lib/qwen-server";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return probeQwenKey(request);
}
