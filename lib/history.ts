export interface HistoryItem {
  id: string;
  /** 时间戳（毫秒） */
  ts: number;
  mode: "generate" | "edit";
  model: string;
  prompt: string;
  params: Record<string, string | number | boolean>;
  /** 可长期保存的 Data-URL */
  image: string;
}

const STORAGE_KEY = "sensenova-image-history-v1";
const MAX_ITEMS = 40;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as HistoryItem[])
      .filter((item) => item && typeof item.image === "string" && item.image.startsWith("data:"))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/** 保存历史；空间不足时从最旧记录开始裁剪重试。返回 false 表示有记录因容量不足被丢弃。 */
export function saveHistory(items: HistoryItem[]): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const target = items.slice(0, MAX_ITEMS);
  let candidate = target;
  while (candidate.length > 0) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      return candidate.length === target.length;
    } catch {
      candidate = candidate.slice(0, Math.max(0, candidate.length - 3));
    }
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, "[]");
  } catch {
    // ignore
  }
  return target.length === 0;
}

export function createHistoryItem(
  input: Omit<HistoryItem, "id" | "ts">,
): HistoryItem {
  return {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
  };
}
