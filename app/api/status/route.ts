import { headers } from "next/headers";

import { PROVIDERS, resolveProviderBaseUrl } from "@/lib/providers";

/** 服务端环境变量配了哪些服务商（自托管单用户回退）。浏览器里的密钥不经过这里。 */
export async function GET(): Promise<Response> {
  await headers();
  return Response.json({
    providers: PROVIDERS.map((provider) => {
      const envKey = (process.env[provider.keyEnv] ?? "").trim();
      const values: Record<string, string> = {};
      for (const field of provider.fields) {
        values[field.id] =
          (field.env ? (process.env[field.env] ?? "").trim() : "") || field.defaultValue || "";
      }
      const { baseUrl } = resolveProviderBaseUrl(provider.id, values);
      return {
        id: provider.id,
        configured: envKey.length > 0,
        endpointResolvable: baseUrl !== null,
        values,
      };
    }),
  });
}
