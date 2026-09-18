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

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * 供 useSyncExternalStore 订阅密钥变化。
 * 同页写入不会触发原生 storage 事件，所以再叠一层模块级监听器；跨标签页靠原生事件兜住。
 */
export function subscribeStoredApiKey(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** 服务端渲染时读不到 localStorage，水合首帧统一按「未配置」处理，随后由订阅纠正。 */
export function getStoredApiKeyServerSnapshot(): string {
  return "";
}

export function setStoredApiKey(key: string): void {
  try {
    window.localStorage.setItem(API_KEY_STORAGE, key);
  } catch {
    // 隐私模式等写入失败时忽略
  }
  notifyStoredApiKeyChange();
}

export function clearStoredApiKey(): void {
  try {
    window.localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // ignore
  }
  notifyStoredApiKeyChange();
}

function notifyStoredApiKeyChange(): void {
  for (const listener of [...listeners]) {
    listener();
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
