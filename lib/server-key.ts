let inMemoryKey: string | null = null;

export type KeySource = "session" | "env";

/** 仅当前服务进程内存有效，重启失效；不落盘、不回传前端 */
export function getRuntimeApiKey(): string | null {
  return inMemoryKey ?? process.env.SENSENOVA_API_KEY ?? null;
}

export function setRuntimeApiKey(key: string | null): void {
  inMemoryKey = key;
}

export function getKeySource(): KeySource | null {
  if (inMemoryKey) {
    return "session";
  }
  if (process.env.SENSENOVA_API_KEY) {
    return "env";
  }
  return null;
}
