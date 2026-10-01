import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDistillPayload,
  buildDistillSystemPrompt,
  distillTargetTokens,
  parseDistillReply,
  stripCodeFence,
} from "./distill";

test("蒸馏指令里写死了目标 token，且不许新增内容", () => {
  const prompt = buildDistillSystemPrompt(3600);
  assert.ok(prompt.includes("3600 token"));
  assert.equal(prompt.includes("{{TARGET_TOKENS}}"), false, "占位符必须被替换掉");
  assert.ok(prompt.includes("不得新增"));
  assert.ok(prompt.includes("打包 ZIP"), "要显式点名删掉的工程指令");
  assert.ok(prompt.includes("固定签名"), "要显式点名删掉「必须画上固定签名」");
  assert.ok(prompt.includes("幕后指令"), "蒸馏结果结尾要留一句防画面泄漏声明");
});

test("字符口径：蒸馏指令写「字符」、max_tokens 不再翻倍", () => {
  const prompt = buildDistillSystemPrompt(4500, "chars");
  assert.ok(prompt.includes("4500 字符（characters）"));
  assert.ok(!prompt.includes("4500 token"), "字符口径不能把目标写成 token");
  assert.equal(
    buildDistillPayload({ model: "m", targetTokens: 4500, unit: "chars", skillBody: "a" }).max_tokens,
    4500,
    "字符口径下 CJK 1 字符 ≈ 1 token，target 本身就是上界",
  );
});

test("蒸馏请求体：system + user 两条，SKILL 原文进 user", () => {
  const payload = buildDistillPayload({
    model: "some-chat-model",
    targetTokens: 3600,
    skillBody: "  SKILL 原文  ",
    userNote: "  标题用 WINTER LIGHTS ",
  });
  assert.equal(payload.model, "some-chat-model");
  assert.equal(payload.messages.length, 2);
  assert.deepEqual(payload.messages.map((m) => m.role), ["system", "user"]);
  assert.equal(payload.messages[1].content, "SKILL 原文\n\n【本次补充要求，必须保留进蒸馏结果】\n标题用 WINTER LIGHTS");
  assert.equal(payload.stream, false);
  assert.equal(payload.max_tokens, 7200);
  assert.equal(buildDistillPayload({ model: "m", targetTokens: 100, skillBody: "a" }).max_tokens, 512);
});

test("蒸馏响应解析：message.content、分段数组与代码壳", () => {
  assert.equal(
    parseDistillReply({ choices: [{ message: { content: "  蒸馏结果  " } }] }),
    "蒸馏结果",
  );
  assert.equal(
    parseDistillReply({ choices: [{ message: { content: [{ text: "前半" }, { text: "后半" }] } }] }),
    "前半后半",
  );
  assert.equal(parseDistillReply({ choices: [] }), "");
  assert.equal(stripCodeFence("```markdown\n正文\n```"), "正文");
  assert.equal(stripCodeFence("没有壳的正文"), "没有壳的正文");
});

test("目标 token：手填优先，其次出图模型上限的 90%，都没就 null", () => {
  assert.equal(distillTargetTokens(4500, "2000"), 2000);
  assert.equal(distillTargetTokens(4500, ""), 4050);
  assert.equal(distillTargetTokens(null, ""), null, "官方未标注上限时不能瞎猜");
  assert.equal(distillTargetTokens(null, "0"), null, "0 不是合法目标");
});
