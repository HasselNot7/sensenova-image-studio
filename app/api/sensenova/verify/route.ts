import { verifySensenovaKey } from "@/lib/sensenova-server";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return verifySensenovaKey(request);
}
