"use client";

/**
 * 浏览器侧的服务商配置存储（BYOK）。
 * 每个服务商一份 { apiKey, values }，全部只存 localStorage；
 * 请求时按 descriptor 声明的头名发给本站代理，代理只转发、不落盘、不记日志。
 */

import {
  PROVIDERS,
  defaultProviderValues,
  findProvider,
  missingRequiredFields,
  resolveProviderBaseUrl,
  type ProviderDescriptor,
} from "./providers";

export const CONFIG_STORAGE = "image-skill-studio.providers";
export const DISTILL_STORAGE = "image-skill-studio.distill";

export interface ProviderCredentials {
  apiKey: string;
  values: Record<string, string>;
}

type Store = Record<string, ProviderCredentials>;

function readStore(): Store {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(next: Store): void {
  try {
    window.localStorage.setItem(CONFIG_STORAGE, JSON.stringify(next));
  } catch {
    // 隐私模式等写入失败时忽略
  }
  notify();
}

type Listener = () => void;

const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/** 同页写入不触发原生 storage 事件，所以叠一层模块级监听；跨标签页靠原生事件兜住。 */
export function subscribeBrowserConfig(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** 服务端渲染读不到 localStorage，水合首帧统一按「未配置」处理，随后由订阅纠正。 */
export function getBrowserConfigServerSnapshot(): string {
  return "";
}

export function getProviderCredentials(provider: ProviderDescriptor): ProviderCredentials {
  const saved = readStore()[provider.id];
  return {
    apiKey: typeof saved?.apiKey === "string" ? saved.apiKey : "",
    values: { ...defaultProviderValues(provider), ...(saved?.values ?? {}) },
  };
}

export function setProviderCredentials(
  provider: ProviderDescriptor,
  next: ProviderCredentials,
): void {
  const store = readStore();
  store[provider.id] = {
    apiKey: next.apiKey.trim(),
    values: { ...defaultProviderValues(provider), ...next.values },
  };
  writeStore(store);
}

export function clearProviderApiKey(provider: ProviderDescriptor): void {
  const store = readStore();
  const current = store[provider.id];
  store[provider.id] = { apiKey: "", values: current?.values ?? defaultProviderValues(provider) };
  writeStore(store);
}

/** 配置摘要：给顶栏状态点与设置界面用。 */
export interface ProviderReadout {
  provider: ProviderDescriptor;
  apiKey: string;
  values: Record<string, string>;
  baseUrl: string | null;
  endpointError: string | null;
  missingFields: string[];
  /** 浏览器里有密钥、且地址能拼出来 */
  usable: boolean;
}

export function readProvider(id: string): ProviderReadout | null {
  const provider = findProvider(id);
  if (!provider) {
    return null;
  }
  const credentials = getProviderCredentials(provider);
  const { baseUrl, error } = resolveProviderBaseUrl(provider.id, credentials.values);
  const missingFields = missingRequiredFields(provider, credentials.values);
  return {
    provider,
    apiKey: credentials.apiKey,
    values: credentials.values,
    baseUrl,
    endpointError: error,
    missingFields,
    usable: credentials.apiKey.length > 0 && baseUrl !== null,
  };
}

export function readAllProviders(): ProviderReadout[] {
  return PROVIDERS.map((provider) => readProvider(provider.id)).filter(
    (item): item is ProviderReadout => item !== null,
  );
}

/** sk- 开头（百炼密钥格式）、去首尾空格后非空且长度合理。 */
export function isValidApiKey(key: string): boolean {
  return /^sk-\S{6,}$/.test(key.trim());
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.length >= 4 ? `····${trimmed.slice(-4)}` : "····";
}

/** 按 descriptor 声明的头名拼出代理请求头。 */
export function buildProviderHeaders(
  provider: ProviderDescriptor,
  keyOverride?: string,
): Record<string, string> {
  const credentials = getProviderCredentials(provider);
  const key = (keyOverride ?? credentials.apiKey).trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key.length > 0) {
    headers[provider.keyHeader] = key;
  }
  for (const field of provider.fields) {
    const value = (credentials.values[field.id] ?? "").trim();
    if (value.length > 0) {
      headers[field.header] = value;
    }
  }
  return headers;
}

/* ---------------- 蒸馏模型（可选：出图前把 SKILL 原文压缩到目标 token 内） ---------------- */

export interface DistillConfig {
  /** OpenAI 兼容端点的 base，形如 https://dashscope.aliyuncs.com/compatible-mode/v1 */
  baseUrl: string;
  /** chat 模型名，由用户填（各家不同，本仓库不预设） */
  model: string;
  apiKey: string;
  /** 蒸馏目标 token 上限（留空 = 用出图模型的建议上限） */
  targetTokens: string;
}

export const EMPTY_DISTILL: DistillConfig = { baseUrl: "", model: "", apiKey: "", targetTokens: "" };

function readDistillRaw(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(DISTILL_STORAGE);
  } catch {
    return null;
  }
}

function writeDistillRaw(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(DISTILL_STORAGE);
    } else {
      window.localStorage.setItem(DISTILL_STORAGE, value);
    }
  } catch {
    // 隐私模式等写入失败时忽略
  }
  notify();
}

export function getDistillConfig(): DistillConfig {
  const raw = readDistillRaw();
  if (!raw) {
    return { ...EMPTY_DISTILL };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DistillConfig>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : "",
      model: typeof parsed.model === "string" ? parsed.model.trim() : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : "",
      targetTokens: typeof parsed.targetTokens === "string" ? parsed.targetTokens.trim() : "",
    };
  } catch {
    return { ...EMPTY_DISTILL };
  }
}

export function setDistillConfig(next: DistillConfig): void {
  writeDistillRaw(JSON.stringify(next));
}

export function clearDistillApiKey(): void {
  const current = getDistillConfig();
  writeDistillRaw(JSON.stringify({ ...current, apiKey: "" }));
}

/** 蒸馏模型可用 = 有 base + 模型名 + 密钥（密钥可来自服务器环境变量，由代理判定）。 */
export function distillUsable(config: DistillConfig = getDistillConfig()): boolean {
  return /^https?:\/\//i.test(config.baseUrl) && config.model.length > 0;
}

export function buildDistillHeaders(config: DistillConfig = getDistillConfig()): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey.length > 0) {
    headers["x-distill-key"] = config.apiKey;
  }
  if (config.baseUrl.length > 0) {
    headers["x-distill-base"] = config.baseUrl;
  }
  return headers;
}
