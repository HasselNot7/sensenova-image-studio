"use client";

/** BYOK：密钥只存在浏览器 localStorage，随请求以 x-sensenova-key 头发给本站代理。 */
export const API_KEY_STORAGE = "sensenova_api_key";

export function getStoredApiKey(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return window.localStorage.getItem(API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setStoredApiKey(key: string): void {
  try {
    window.localStorage.setItem(API_KEY_STORAGE, key);
  } catch {
    // 隐私模式等写入失败时忽略
  }
}

export function clearStoredApiKey(): void {
  try {
    window.localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // ignore
  }
}

/** sk- 前缀、去首尾空格、非空且长度合理。 */
export function isValidApiKey(key: string): boolean {
  return /^sk-\S{6,}$/.test(key.trim());
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.length >= 4 ? `····${trimmed.slice(-4)}` : "····";
}
