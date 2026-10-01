import { verifyGptImageKey } from "@/lib/gpt-image-server";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return verifyGptImageKey(request);
}
