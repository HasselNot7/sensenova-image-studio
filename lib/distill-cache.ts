/**
 * 在线蒸馏结果的缓存。
 *
 * 蒸馏输出只由「被蒸馏的源正文 + 蒸馏模型 + 目标长度与单位」决定，跟换哪张照片、
 * 选哪个尺寸无关；以前结果只存组件 state，换照片 / 刷新 / HMR 都得再等一次上游。
 * 键里带源正文长度与双哈希：正文改一个字就换键，不会把旧结果当成新的发出去。
 */

export const DISTILL_CACHE_STORAGE = "image-skill-studio.distill-cache";
const MAX_ENTRIES = 12;

export interface DistillCacheInput {
  /** 真正被蒸馏的那份源正文（已含用户本次补充） */
  source: string;
  model: string;
  target: number;
  unit: "tokens" | "chars";
}

export interface DistillCacheEntry {
  text: string;
  fromChars: number;
  model: string;
}

/** localStorage 的最小面，测试传假实现。 */
export interface DistillKV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Row {
  key: string;
  entry: DistillCacheEntry;
}

function hashSource(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return `${text.length}.${a.toString(36)}${b.toString(36)}`;
}

export function distillCacheKey(input: DistillCacheInput): string {
  return `${hashSource(input.source)}|${input.model}|${input.target}${input.unit === "chars" ? "c" : "t"}`;
}

function isRow(value: unknown): value is Row {
  const row = value as { key?: unknown; entry?: { text?: unknown; fromChars?: unknown; model?: unknown } };
  return (
    typeof row?.key === "string" &&
    row.key.length > 0 &&
    typeof row.entry?.text === "string" &&
    row.entry.text.length > 0 &&
    typeof row.entry.fromChars === "number" &&
    typeof row.entry.model === "string"
  );
}

function readRows(store: DistillKV): Row[] {
  try {
    const raw = store.getItem(DISTILL_CACHE_STORAGE);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRow) : [];
  } catch {
    return [];
  }
}

function writeRows(store: DistillKV, rows: Row[]): void {
  try {
    store.setItem(DISTILL_CACHE_STORAGE, JSON.stringify(rows));
  } catch {
    // 隐私模式或配额写不进去就不缓存，绝不因此影响出图
  }
}

export function recallDistillEntry(store: DistillKV, key: string): DistillCacheEntry | null {
  return readRows(store).find((row) => row.key === key)?.entry ?? null;
}

/**
 * 给 useSyncExternalStore 用的读取：同一个键永远返回同一个对象引用。
 * 快照函数每次调用都新建对象会让 React 陷入无限重渲染。
 */
const memo = new Map<string, DistillCacheEntry | null>();
const MAX_MEMO = MAX_ENTRIES * 2;

function memoSet(key: string, entry: DistillCacheEntry | null): void {
  memo.set(key, entry);
  if (memo.size > MAX_MEMO) {
    memo.delete(memo.keys().next().value as string);
  }
}

export function recallDistillStable(
  store: DistillKV,
  key: string | null,
): DistillCacheEntry | null {
  if (key === null) {
    return null;
  }
  if (memo.has(key)) {
    return memo.get(key) ?? null;
  }
  const hit = recallDistillEntry(store, key);
  memoSet(key, hit);
  return hit;
}

export function rememberDistillEntry(store: DistillKV, key: string, entry: DistillCacheEntry): void {
  const rows = readRows(store).filter((row) => row.key !== key);
  rows.push({ key, entry });
  writeRows(store, rows.slice(-MAX_ENTRIES));
  memoSet(key, entry);
}
