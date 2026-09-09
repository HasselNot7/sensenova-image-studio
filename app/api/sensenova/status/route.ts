import { headers } from "next/headers";

import { getKeySource } from "@/lib/server-key";

export async function GET(): Promise<Response> {
  await headers();
  const source = getKeySource();
  return Response.json({
    configured: source !== null,
    source,
  });
}
