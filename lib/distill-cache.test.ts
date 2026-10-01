import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DISTILL_CACHE_STORAGE,
  distillCacheKey,
  recallDistillEntry,
  recallDistillStable,
  rememberDistillEntry,
} from "./distill-cache";

interface FakeKV {
  data: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function fakeStore(): FakeKV {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const BASE = { source: "SKILL 原文正文".repeat(40), model: "chat-pro", target: 4050, unit: "tokens" as const };

test("蒸馏缓存键：四个入参任一变了就换键，全同则同键", () => {
  assert.equal(distillCacheKey(BASE), distillCacheKey({ ...BASE }));
  assert.notEqual(distillCacheKey(BASE), distillCacheKey({ ...BASE, model: "chat-max" }));
  assert.notEqual(distillCacheKey(BASE), distillCacheKey({ ...BASE, target: 4500 }));
  assert.notEqual(
    distillCacheKey(BASE),
    distillCacheKey({ ...BASE, unit: "chars", target: BASE.target }),
    "同数字的 token 与字符口径必须是两回事",
  );
  // 30k 字符的原文改一个字：绝不能把旧结果当成新的发出去
  const edited = `${BASE.source}X`;
  assert.notEqual(distillCacheKey(BASE), distillCacheKey({ ...BASE, source: edited }));
});

test("蒸馏缓存读写：按键取回、别的键取不到、脏数据不炸", () => {
  const store = fakeStore();
  const key = distillCacheKey(BASE);
  assert.equal(recallDistillEntry(store, key), null, "空缓存");
  rememberDistillEntry(store, key, { text: "蒸馏结果", fromChars: 240, model: BASE.model });
  assert.deepEqual(recallDistillEntry(store, key), {
    text: "蒸馏结果",
    fromChars: 240,
    model: BASE.model,
  });
  assert.equal(
    recallDistillEntry(store, distillCacheKey({ ...BASE, source: "另一份原文" })),
    null,
    "阳性对照：别的源不许命中",
  );
  store.data.set(DISTILL_CACHE_STORAGE, "{不是 JSON");
  assert.equal(recallDistillEntry(store, key), null, "坏数据当没有，别抛");
  rememberDistillEntry(store, key, { text: "重写", fromChars: 1, model: "m" });
  assert.deepEqual(recallDistillEntry(store, key)?.text, "重写");
});

test("蒸馏缓存最多留 12 条，新的进来挤掉最旧的", () => {
  const store = fakeStore();
  for (let i = 0; i < 15; i += 1) {
    const key = distillCacheKey({ ...BASE, source: `第 ${i} 份正文` });
    rememberDistillEntry(store, key, { text: `结果 ${i}`, fromChars: i, model: BASE.model });
  }
  const rows = JSON.parse(String(store.data.get(DISTILL_CACHE_STORAGE))) as unknown[];
  assert.equal(rows.length, 12);
  assert.equal(
    recallDistillEntry(store, distillCacheKey({ ...BASE, source: "第 0 份正文" })),
    null,
    "最旧那条应已被挤掉",
  );
  assert.equal(
    recallDistillEntry(store, distillCacheKey({ ...BASE, source: "第 14 份正文" }))?.text,
    "结果 14",
  );
});

test("同一键重复写入只占一格", () => {
  const store = fakeStore();
  const key = distillCacheKey(BASE);
  rememberDistillEntry(store, key, { text: "第一次", fromChars: 1, model: BASE.model });
  rememberDistillEntry(store, key, { text: "第二次", fromChars: 1, model: BASE.model });
  const rows = JSON.parse(String(store.data.get(DISTILL_CACHE_STORAGE))) as unknown[];
  assert.equal(rows.length, 1);
  assert.equal(recallDistillEntry(store, key)?.text, "第二次");
});

test("稳定快照：同键同引用（useSyncExternalStore 的硬要求），写入后立刻读得到", () => {
  const store = fakeStore();
  // 键里换一份正文：模块级 memo 跨用例存活，别拿别的用例写过的键做断言
  const key = distillCacheKey({ ...BASE, source: "稳定快照专用正文" });
  const miss = recallDistillStable(store, key);
  assert.equal(miss, null);
  assert.equal(recallDistillStable(store, key), miss, "未命中的 null 也要稳定，否则无限重渲染");
  assert.equal(recallDistillStable(store, null), null);
  rememberDistillEntry(store, key, { text: "结果", fromChars: 7, model: BASE.model });
  const first = recallDistillStable(store, key);
  assert.equal(first?.text, "结果");
  assert.equal(recallDistillStable(store, key), first, "同一键必须返回同一对象引用");
});
