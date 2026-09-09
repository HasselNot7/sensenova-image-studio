import { clear, createStore, delMany, get, set } from "idb-keyval";

export type HistoryMode = "generate" | "edit";

/** 完整历史记录：仅在「写入」或「点开详情/下载」时携带原图 data-URL。 */
export interface HistoryInput {
  id: string;
  ts: number;
  mode: HistoryMode;
  model: string;
  prompt: string;
  params: Record<string, string | number | boolean>;
  image: string;
}

/** 列表条目：只有元数据 + 缩略图，避免整表加载大图。 */
export interface HistoryMeta {
  id: string;
  ts: number;
  mode: HistoryMode;
  model: string;
  prompt: string;
  params: Record<string, string | number | boolean>;
  thumb: string;
}

const LEGACY_KEY = "sensenova-image-history-v1";
const MAX_ITEMS = 40;
const THUMB_MAX_EDGE = 256;
const THUMB_QUALITY = 0.8;

// 单一 object store：列表存在 LIST_KEY，原图按 img:<id> 分键存储，互不干扰。
const store = createStore("sensenova-image-studio", "history");
const LIST_KEY = "list";

function imageKey(id: string): string {
  return `img:${id}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败，无法生成缩略图"));
    img.src = dataUrl;
  });
}

/** 等比缩放至长边 256px，输出 JPEG quality 0.8 的 data-URL；失败回退原图，绝不丢记录。 */
export async function createThumbnail(dataUrl: string): Promise<string> {
  try {
    const img = await loadImageElement(dataUrl);
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longEdge > THUMB_MAX_EDGE ? THUMB_MAX_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return dataUrl;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", THUMB_QUALITY);
  } catch (error) {
    console.error("缩略图生成失败，列表将临时使用原图", error);
    return dataUrl;
  }
}

export function createHistoryItem(
  input: Omit<HistoryInput, "id" | "ts">,
): HistoryInput {
  return {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
  };
}

async function readList(): Promise<HistoryMeta[]> {
  const list = await get<HistoryMeta[]>(LIST_KEY, store);
  return Array.isArray(list) ? list : [];
}

/** 读取列表（元数据 + 缩略图，不含原图）。 */
export async function loadHistoryList(): Promise<HistoryMeta[]> {
  return readList();
}

/** 按 id 懒加载原图 data-URL；缺失返回 null。 */
export async function loadHistoryImage(id: string): Promise<string | null> {
  const data = await get<string>(imageKey(id), store);
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * 新增一条记录：先生成缩略图并写入原图，再更新列表；返回最新列表供即时刷新。
 * 任何 IndexedDB 异常都会 throw，由调用方提示，不静默失败。
 */
export async function addHistoryEntry(item: HistoryInput): Promise<HistoryMeta[]> {
  const thumb = await createThumbnail(item.image);
  const meta: HistoryMeta = {
    id: item.id,
    ts: item.ts,
    mode: item.mode,
    model: item.model,
    prompt: item.prompt,
    params: item.params,
    thumb,
  };
  // 先落原图（体积最大、最易触发配额），失败即抛出且不改动列表。
  await set(imageKey(item.id), item.image, store);
  const current = await readList();
  const base = current.filter((m) => m.id !== meta.id);
  const merged = [meta, ...base];
  const dropped = merged.slice(MAX_ITEMS);
  const nextList = merged.slice(0, MAX_ITEMS);
  await set(LIST_KEY, nextList, store);
  if (dropped.length > 0) {
    try {
      await delMany(
        dropped.map((m) => imageKey(m.id)),
        store,
      );
    } catch (error) {
      console.error("清理溢出历史原图失败", error);
    }
  }
  return nextList;
}

/** 删除单条记录并同步清理其原图。 */
export async function removeHistoryEntry(id: string): Promise<HistoryMeta[]> {
  const current = await readList();
  const nextList = current.filter((m) => m.id !== id);
  await set(LIST_KEY, nextList, store);
  try {
    await delMany([imageKey(id)], store);
  } catch (error) {
    console.error("删除历史原图失败", error);
  }
  return nextList;
}

/** 清空全部历史（列表 + 所有原图）。 */
export async function clearAllHistory(): Promise<void> {
  await clear(store);
}

export interface MigrateResult {
  migrated: number;
  error: string | null;
}

let migrating: Promise<MigrateResult> | null = null;

/**
 * 一次性迁移旧 localStorage 数据到 IndexedDB。
 * 成功则删除旧键；失败忽略并保留旧键（下次启动重试），返回 error 供上层提示。
 */
export async function migrateLegacyHistory(): Promise<MigrateResult> {
  if (typeof window === "undefined") {
    return { migrated: 0, error: null };
  }
  if (migrating) {
    return migrating;
  }
  migrating = (async (): Promise<MigrateResult> => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(LEGACY_KEY);
    } catch {
      return { migrated: 0, error: null };
    }
    if (!raw) {
      return { migrated: 0, error: null };
    }

    let legacy: unknown;
    try {
      legacy = JSON.parse(raw);
    } catch {
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // ignore
      }
      return { migrated: 0, error: "旧历史记录格式损坏，已忽略" };
    }
    if (!Array.isArray(legacy)) {
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // ignore
      }
      return { migrated: 0, error: "旧历史记录无法识别，已忽略" };
    }

    try {
      const existing = await readList();
      const seen = new Set(existing.map((m) => m.id));
      const added: HistoryMeta[] = [];
      const imagesToWrite: { key: string; value: string }[] = [];

      for (const rawItem of legacy) {
        const it = rawItem as Partial<HistoryInput>;
        if (!it || typeof it.image !== "string" || !it.image.startsWith("data:")) {
          continue;
        }
        if (typeof it.id !== "string" || it.id.length === 0 || seen.has(it.id)) {
          continue;
        }
        seen.add(it.id);
        const thumb = await createThumbnail(it.image);
        imagesToWrite.push({ key: imageKey(it.id), value: it.image });
        added.push({
          id: it.id,
          ts: typeof it.ts === "number" ? it.ts : Date.now(),
          mode: it.mode === "edit" ? "edit" : "generate",
          model: typeof it.model === "string" ? it.model : "unknown",
          prompt: typeof it.prompt === "string" ? it.prompt : "",
          params:
            typeof it.params === "object" && it.params !== null ? it.params : {},
          thumb,
        });
      }

      for (const { key, value } of imagesToWrite) {
        await set(key, value, store);
      }
      const merged = [...existing, ...added].sort((a, b) => b.ts - a.ts);
      const dropped = merged.slice(MAX_ITEMS);
      await set(LIST_KEY, merged.slice(0, MAX_ITEMS), store);
      if (dropped.length > 0) {
        try {
          await delMany(
            dropped.map((m) => imageKey(m.id)),
            store,
          );
        } catch (error) {
          console.error("迁移时清理溢出历史原图失败", error);
        }
      }

      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        // ignore
      }
      return { migrated: added.length, error: null };
    } catch (error) {
      // 迁移失败：保留旧键，下次启动可重试。
      console.error("历史记录迁移失败", error);
      return { migrated: 0, error: errorMessage(error) };
    }
  })();

  const result = await migrating;
  migrating = null;
  return result;
}
