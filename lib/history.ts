import { clear, createStore, delMany, get, set } from "idb-keyval";

/**
 * 历史记录存 IndexedDB（不是 localStorage，容量放得下原图）。
 * 正文是 SKILL 全文，单条可上百 KB，所以列表只存头 160 字 + 字符数，
 * 点开详情也只读原图与前几条参数；重新使用靠 skillId 回到对应 Skill。
 */

export interface HistoryInput {
  id: string;
  ts: number;
  skillId: string;
  skillName: string;
  model: string;
  /** 用户本次补充（可为空串），完整保存 */
  userNote: string;
  /** 实际发送正文的字符数与开头，用于列表摘要 */
  promptChars: number;
  promptHead: string;
  params: Record<string, string | number | boolean>;
  image: string;
}

export interface HistoryMeta {
  id: string;
  ts: number;
  skillId: string;
  skillName: string;
  model: string;
  userNote: string;
  promptChars: number;
  promptHead: string;
  params: Record<string, string | number | boolean>;
  thumb: string;
}

export const PROMPT_HEAD_CHARS = 160;

const MAX_ITEMS = 40;
const THUMB_MAX_EDGE = 256;
const THUMB_QUALITY = 0.8;

const store = createStore("image-skill-studio", "history");
const LIST_KEY = "list";

function imageKey(id: string): string {
  return `img:${id}`;
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

function toMeta(item: HistoryInput): HistoryMeta {
  const { image, ...rest } = item;
  return { ...rest, thumb: image };
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
  const meta: HistoryMeta = { ...toMeta(item), thumb };
  // 先落原图（体积最大、最易触发配额），失败即抛出且不改动列表。
  await set(imageKey(item.id), item.image, store);
  const current = await readList();
  const base = current.filter((entry) => entry.id !== meta.id);
  const merged = [meta, ...base];
  const dropped = merged.slice(MAX_ITEMS);
  const nextList = merged.slice(0, MAX_ITEMS);
  await set(LIST_KEY, nextList, store);
  if (dropped.length > 0) {
    try {
      await delMany(
        dropped.map((entry) => imageKey(entry.id)),
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
  const nextList = current.filter((entry) => entry.id !== id);
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
