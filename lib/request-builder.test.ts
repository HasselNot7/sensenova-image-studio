import assert from "node:assert/strict";
import { test } from "node:test";

import { measureTextBudget } from "./prompt-budget";
import {
  assemblePrompt,
  buildQwenPayload,
  buildStudioRequest,
  validateQwenPayload,
  validateStudioParams,
} from "./request-builder";
import { validateCustomSize } from "./models";
import {
  buildSensenovaPayload,
  validateSensenovaPayload,
  SENSENOVA_EDITS_PATH,
  SENSENOVA_GENERATIONS_PATH,
} from "./sensenova";

const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function payloadOf(overrides: Record<string, unknown> = {}) {
  return {
    model: "qwen-image-3.0",
    input: { messages: [{ role: "user", content: [{ text: "出一张纸刊海报" }] }] },
    parameters: { n: 1, size: "2048*2048", watermark: false, prompt_extend: false },
    ...overrides,
  };
}

test("文生图请求：content 只有一个 text，参数按显式开关装配", () => {
  const request = buildStudioRequest({
      providerId: "qwen",
    model: "qwen-image-3.0",
    prompt: "  一篇 SKILL 原文  ",
    images: [],
    size: "auto",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: true,
    watermark: false,
    seed: "",
  });
  assert.equal(request.prompt, "一篇 SKILL 原文", "正文两端空白应被裁掉");
  assert.deepEqual(request.images, []);
  assert.equal(request.prompt_extend, false);
  assert.equal("prompt_extend_mode" in request, false, "关润色时不应发 prompt_extend_mode");
  assert.equal("enable_thinking" in request, false, "关润色时不应发 enable_thinking");
  assert.equal("seed" in request, false, "seed 留空表示不发送");
});

test("图生图请求：开启润色才带 mode 与思考，且 seed 可发", () => {
  const request = buildStudioRequest({
      providerId: "qwen",
    model: "qwen-image-3.0-pro",
    prompt: "正文",
    images: [DATA_URL],
    size: "2048*2048",
    n: 2,
    negativePrompt: "低分辨率",
    promptExtend: true,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: true,
    seed: "12345",
  });
  assert.equal(request.prompt_extend_mode, "direct");
  assert.equal(request.enable_thinking, false);
  assert.equal(request.seed, 12345);
  assert.equal(request.n, 2);
  assert.equal(request.watermark, true);
});

test("补充要求拼在正文末尾，不动 SKILL 原文", () => {
  const body = assemblePrompt("SKILL 原文第一行", "  标题用 winter avenue  ");
  assert.ok(body.startsWith("SKILL 原文第一行"));
  assert.ok(body.includes("## 用户本次补充要求"));
  assert.ok(body.endsWith("标题用 winter avenue"));
  assert.equal(assemblePrompt("只有原文", "   "), "只有原文");
});

test("带输入图时 agent 模式必须报错", () => {
  const issue = validateStudioParams({
    providerId: "qwen",
    model: "qwen-image-3.0",
    prompt: "正文",
    images: [DATA_URL],
    size: "auto",
    customSize: "",
    n: 1,
    negativePrompt: "",
    promptExtend: true,
    promptExtendMode: "agent",
    enableThinking: false,
    watermark: false,
    seed: "",
  });
  assert.ok(issue);
  assert.equal(issue.field, "prompt_extend_mode");
});

test("润色关掉时不该拿 enable_thinking 拦提交（该字段根本不会发）", () => {
  const params = {
    providerId: "qwen",
    model: "qwen-image-3.0",
    prompt: "正文",
    images: [],
    size: "auto",
    customSize: "",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "agent" as const,
    enableThinking: true,
    watermark: false,
    seed: "",
  };
  assert.equal(validateStudioParams(params), null, "隐藏的开关不能反过来卡住提交");
  const request = buildStudioRequest(params);
  assert.equal("enable_thinking" in request, false);
  assert.equal("prompt_extend_mode" in request, false);
});

test("输入图与张数按模型上限校验", () => {
  const tooMany = validateStudioParams({
    providerId: "qwen",
    model: "qwen-image-3.0",
    prompt: "正文",
    images: [DATA_URL, DATA_URL, DATA_URL, DATA_URL],
    size: "auto",
    customSize: "",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: false,
    seed: "",
  });
  assert.ok(tooMany);
  assert.equal(tooMany.field, "images");

  const badImage = validateStudioParams({
    providerId: "qwen",
    model: "qwen-image-3.0",
    prompt: "正文",
    images: ["oss://bucket/key.png"],
    size: "auto",
    customSize: "",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: false,
    seed: "",
  });
  assert.ok(badImage);
  assert.equal(badImage.field, "images");
});

test("尺寸：必须是 W*H 且总像素落在官方带内", () => {
  assert.equal(validateCustomSize("2048*2048"), null);
  assert.equal(validateCustomSize("2688*1536"), null, "16:9 建议常量总像素仍在带内");
  assert.equal(validateCustomSize("2048*256"), null, "恰好 8:1 应通过");
  assert.ok(validateCustomSize("2048x1152"), "小写 x 不是官方分隔符");
  assert.ok(validateCustomSize("4096*4096"));
  assert.ok(validateCustomSize("100*100"));
  assert.ok(validateCustomSize("2048*200"));
});

test("negative_prompt 超 500 字符报错", () => {
  const issue = validateStudioParams({
    providerId: "qwen",
    model: "qwen-image-3.0",
    prompt: "正文",
    images: [],
    size: "auto",
    customSize: "",
    n: 1,
    negativePrompt: "字".repeat(501),
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: false,
    seed: "",
  });
  assert.ok(issue);
  assert.equal(issue.field, "negative_prompt");
});

test("token 估算：中文按字、拉丁按 4 字符", () => {
  assert.equal(measureTextBudget("abcd").tokens, 1);
  assert.equal(measureTextBudget("中文").tokens, 2);
  assert.equal(measureTextBudget("").tokens, 0);
  const mixed = measureTextBudget("中文abcd");
  assert.equal(mixed.cjkChars, 2);
  assert.equal(mixed.tokens, 3);
});

test("线上请求体：扁平结构要翻成 input.messages + parameters，顶层不许出现 prompt/images", () => {
  const payload = buildQwenPayload(
    buildStudioRequest({
      providerId: "qwen",
      model: "qwen-image-3.0",
      prompt: "SKILL 全文正文",
      images: ["data:image/png;base64,AAAA", DATA_URL],
      size: "auto",
      n: 2,
      negativePrompt: "  低分辨率  ",
      promptExtend: true,
      promptExtendMode: "direct",
      enableThinking: false,
      watermark: false,
      seed: "7",
    }),
  );
  assert.deepEqual(Object.keys(payload).sort(), ["input", "model", "parameters"]);
  const message = payload.input.messages[0];
  assert.equal(message.role, "user");
  assert.deepEqual(
    message.content.map((item) => Object.keys(item)[0]),
    ["image", "image", "text"],
    "图在前、正文最后一条",
  );
  assert.equal(payload.parameters.n, 2);
  assert.equal("size" in payload.parameters, false, "auto 不该发 size 字段，上游不认字面量 auto");
  assert.equal(payload.parameters.watermark, false);
  assert.equal(payload.parameters.prompt_extend, true);
  assert.equal(payload.parameters.prompt_extend_mode, "direct");
  assert.equal(payload.parameters.enable_thinking, false);
  assert.equal(payload.parameters.negative_prompt, "低分辨率", "两端空白应裁掉");
  assert.equal(payload.parameters.seed, 7);
  assert.equal("prompt" in payload, false);
  assert.equal("images" in payload, false);
});

test("线上请求体：空 negative_prompt 不发送；纯文生图 content 只有 text", () => {
  const payload = buildQwenPayload(
    buildStudioRequest({
      providerId: "qwen",
      model: "qwen-image-2.0",
      prompt: "正文",
      images: [],
      size: "2048*2048",
      n: 1,
      negativePrompt: "   ",
      promptExtend: false,
      promptExtendMode: "direct",
      enableThinking: true,
      watermark: true,
      seed: "",
    }),
  );
  assert.deepEqual(payload.input.messages[0].content, [{ text: "正文" }]);
  assert.equal("negative_prompt" in payload.parameters, false);
  assert.equal("seed" in payload.parameters, false);
  assert.equal(
    "prompt_extend_mode" in payload.parameters,
    false,
    "关润色时不该带 mode（2.0 也没有该字段）",
  );
  assert.equal("enable_thinking" in payload.parameters, false);
  assert.equal(validateQwenPayload(payload), null, "装配结果必须能过服务端校验");
});

test("服务端载荷校验：拒绝越界字段与畸形 messages", () => {
  assert.equal(validateQwenPayload(payloadOf()), null);
  assert.equal(validateQwenPayload(payloadOf({ apiKey: "sk-x" }))?.field, "apiKey");
  assert.equal(
    validateQwenPayload({
      ...payloadOf(),
      input: { messages: [{ role: "user", content: [{ text: "a" }] }, { role: "user", content: [{ text: "b" }] }] },
    })?.field,
    "input.messages",
  );
  const withRole = (role: string) =>
    payloadOf({ input: { messages: [{ role, content: [{ text: "a" }] } ] } });
  assert.equal(validateQwenPayload(withRole("assistant"))?.field, "input.messages[0].role");

  const withContent = (content: unknown[]) =>
    payloadOf({ input: { messages: [{ role: "user", content }] } });
  assert.equal(validateQwenPayload(withContent([{ text: "a" }, { text: "b" }]))?.field, "text");
  assert.equal(
    validateQwenPayload(withContent([{ image: DATA_URL }]))?.field,
    "text",
    "缺 text 也要拦",
  );
  assert.equal(validateQwenPayload(withContent([{ url: "x" }]))?.field, "content");
  assert.equal(validateQwenPayload(withContent([{ image: "//nope", text: "a" }]))?.field, "content");
  assert.equal(validateQwenPayload(payloadOf({ parameters: { size: "auto" } }))?.field, "size");
  assert.equal(validateQwenPayload(payloadOf({ parameters: { n: 7 } }))?.field, "n");
  assert.equal(validateQwenPayload(payloadOf({ parameters: { size: "2048x2048" } }))?.field, "size");
  assert.equal(
    validateQwenPayload(payloadOf({ parameters: { prompt_extend: true, enable_thinking: false, watermark: "no" } }))
      ?.field,
    "watermark",
  );
  assert.equal(
    validateQwenPayload({ ...payloadOf({ parameters: { prompt_extend_mode: "agent" } }), input: { messages: [{ role: "user", content: [{ image: DATA_URL }, { text: "a" }] }] } })
      ?.field,
    "prompt_extend_mode",
  );
  assert.equal(
    validateQwenPayload(payloadOf({ model: "qwen-image-max" }))?.field,
    "model",
    "未收录的模型 ID 不进代理",
  );
});

test("2.0 系列不支持 3.0 才有的字段", () => {
  assert.equal(
    validateQwenPayload(payloadOf({ model: "qwen-image-2.0", parameters: { prompt_extend: true, prompt_extend_mode: "direct" } }))
      ?.field,
    "prompt_extend_mode",
  );
  assert.equal(
    validateQwenPayload(payloadOf({ model: "qwen-image-2.0", parameters: { prompt_extend: true, enable_thinking: true } }))
      ?.field,
    "enable_thinking",
  );
});

/* ---------------- SenseNova 线上格式 ---------------- */

function sensenovaRequest(overrides: Record<string, unknown> = {}) {
  return buildStudioRequest({
    providerId: "sensenova",
    model: "sensenova-u1.5-lite",
    prompt: "一篇 SKILL 原文",
    images: [],
    size: "2048x2048",
    n: 3,
    negativePrompt: "低分辨率",
    promptExtend: true,
    promptExtendMode: "direct",
    enableThinking: true,
    watermark: false,
    seed: "123",
    ...overrides,
  } as never) as never;
}

test("SenseNova：n 强制为 1，千问专属字段一律不发", () => {
  const request = sensenovaRequest() as ReturnType<typeof buildStudioRequest>;
  assert.equal(request.n, 1, "u1.5-lite 仅支持 n=1");
  assert.equal("seed" in request, false, "SenseNova 没有 seed");
  assert.equal("prompt_extend_mode" in request, false);
  assert.equal("enable_thinking" in request, false);
  const call = buildSensenovaPayload(request);
  assert.equal(call.path, SENSENOVA_GENERATIONS_PATH);
  assert.deepEqual(Object.keys(call.body).sort(), [
    "model",
    "n",
    "prompt",
    "prompt_extend",
    "response_format",
    "size",
    "watermark",
  ]);
  assert.equal("negative_prompt" in call.body, false, "官方参数表里没有该字段");
  assert.equal(call.body.response_format, "b64_json");
  assert.equal(call.body.watermark, false, "watermark 必须显式传");
});

test("SenseNova：带输入图走 edits 端点，images 是 {image_url} 数组", () => {
  const request = sensenovaRequest({ images: [DATA_URL] }) as ReturnType<typeof buildStudioRequest>;
  const call = buildSensenovaPayload(request);
  assert.equal(call.path, SENSENOVA_EDITS_PATH);
  assert.deepEqual(call.body.images, [{ image_url: DATA_URL }]);
  assert.equal(validateSensenovaPayload(call.body, SENSENOVA_EDITS_PATH), null);
});

test("SenseNova：u1-fast 拒绝输入图与越界参数", () => {
  const issue = validateStudioParams({
    providerId: "sensenova",
    model: "sensenova-u1-fast",
    prompt: "正文",
    images: [DATA_URL],
    size: "2048x2048",
    customSize: "",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: false,
    seed: "",
  });
  assert.ok(issue);
  assert.equal(issue.field, "images");

  const badSize = validateStudioParams({
    providerId: "sensenova",
    model: "sensenova-u1-fast",
    prompt: "正文",
    images: [],
    size: "1920x1080",
    customSize: "",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: false,
    seed: "",
  });
  assert.equal(badSize?.field, "size", "u1-fast 只认 11 个固定常量");
});

test("SenseNova：u1.5-lite 自定义尺寸按 32 倍数 / 512~4096 / ≤3:1 校验", () => {
  const base = {
    customSize: "1504x2016",
    enableThinking: false,
    images: [],
    model: "sensenova-u1.5-lite",
    n: 1,
    negativePrompt: "",
    prompt: "正文",
    promptExtend: false,
    promptExtendMode: "direct" as const,
    providerId: "sensenova",
    seed: "",
    size: "__custom__",
    watermark: false,
  };
  assert.equal(validateStudioParams(base), null);
  assert.equal(validateStudioParams({ ...base, customSize: "1500x2000" })?.field, "customSize", "不是 32 的倍数");
  assert.equal(validateStudioParams({ ...base, customSize: "4096x1024" })?.field, "customSize", "超过 3:1");
  assert.equal(validateStudioParams({ ...base, customSize: "256x1024" })?.field, "customSize", "低于 512");
});

test("SenseNova：代理侧拦住 u1-fast 不认识的参数", () => {
  assert.equal(
    validateSensenovaPayload(
      { model: "sensenova-u1-fast", prompt: "a", size: "2048x2048", n: 1, watermark: false, prompt_extend: true },
      SENSENOVA_GENERATIONS_PATH,
    )?.field,
    "prompt_extend",
  );
  assert.equal(
    validateSensenovaPayload(
      { model: "sensenova-u1.5-lite", prompt: "a", size: "2048x2048", n: 2, watermark: false },
      SENSENOVA_GENERATIONS_PATH,
    )?.field,
    "n",
  );
  assert.equal(
    validateSensenovaPayload(
      { model: "sensenova-u1-fast", prompt: "a", size: "2048x2048", n: 1, watermark: false },
      SENSENOVA_EDITS_PATH,
    )?.field,
    "model",
    "编辑端点只给 u1.5-lite",
  );
});

test("输入图长边：按各家策略夹取，不是一刀切 2048", async () => {
  const { resolveTargetEdge } = await import("./image-input");
  const { QWEN_INPUT_IMAGE, QWEN_INPUT_IMAGE_2X } = await import("./models");
  const { findSensenovaModel } = await import("./sensenova");
  const snLite = findSensenovaModel("sensenova-u1.5-lite");
  assert.ok(snLite);

  // 千问 3.0：默认 2048（自家文档建议），滑杆右端 4096（用户拍板，官方建议只到 3072）
  assert.equal(QWEN_INPUT_IMAGE.maxEdgeCeiling, 4096);
  assert.equal(QWEN_INPUT_IMAGE.defaultMaxEdge, 2048);
  assert.equal(QWEN_INPUT_IMAGE.allowUncompressed, false);
  assert.equal(resolveTargetEdge(QWEN_INPUT_IMAGE, 3000), 3000);
  assert.equal(resolveTargetEdge(QWEN_INPUT_IMAGE, 1500), 1500);
  assert.equal(
    resolveTargetEdge(QWEN_INPUT_IMAGE, 4000, true),
    4000,
    "4000 在 4096 之内原样放行，且没有「不压缩」",
  );
  assert.equal(resolveTargetEdge(QWEN_INPUT_IMAGE, 5000), 4096, "超出 4096 才夹取");

  // 千问 2.0：编辑文档建议 384~3072（默认 3072），滑杆右端同样放宽到 4096
  assert.equal(QWEN_INPUT_IMAGE_2X.maxEdgeCeiling, 4096);
  assert.equal(QWEN_INPUT_IMAGE_2X.defaultMaxEdge, 3072);
  assert.equal(resolveTargetEdge(QWEN_INPUT_IMAGE_2X, 3000), 3000);

  // SenseNova：长边由用户定，可以完全不压
  assert.equal(snLite.inputImage.allowUncompressed, true);
  assert.equal(snLite.inputImage.minEdge, null, "官方没标最短边就不该拦人");
  assert.equal(resolveTargetEdge(snLite.inputImage, 2048, true), Number.POSITIVE_INFINITY);
  assert.equal(resolveTargetEdge(snLite.inputImage, 2600, false), 2600);
});

test("预蒸馏正文：每个 Skill 都有，且放得下 qwen-3.0 的 4500 token", async () => {
  const { SKILLS } = await import("./skills");
  const { measureTextBudget } = await import("./prompt-budget");
  assert.ok(SKILLS.length >= 5);
  for (const skill of SKILLS) {
    assert.ok(skill.distilledBody, `${skill.id} 缺少 distilled.md`);
    assert.ok(skill.distilledStats, `${skill.id} 缺少精简版统计`);
    const budget = measureTextBudget(skill.distilledBody);
    assert.ok(
      budget.tokens <= 4500,
      `${skill.id} 精简版估算 ${budget.tokens} token，超出 qwen-3.0 上限`,
    );
    assert.ok(budget.chars < skill.stats.chars, `${skill.id} 精简版应比原文短`);
  }
});

test("提示词上限口径：u1.5 系按字符计，token 估算对英文文本会漏报", async () => {
  const { exceedsPromptBudget, measureTextBudget } = await import("./prompt-budget");
  const { findSensenovaModel } = await import("./sensenova");
  const lite = findSensenovaModel("sensenova-u1.5-lite");
  assert.ok(lite);
  assert.equal(lite.promptLimitUnit, "chars");
  assert.equal(lite.promptTokenLimit, 5000, "上游实测报错 should not exceed 5000 characters");
  assert.equal(findSensenovaModel("sensenova-u1-fast")?.promptLimitUnit, "tokens");

  // photo-abstract 量级：7000+ 字符的拉丁文本，token 估算只有 1/4 左右
  const budget = measureTextBudget("a".repeat(7324));
  assert.equal(exceedsPromptBudget(budget, 5000, "chars"), true, "按字符口径应判超限");
  assert.equal(
    exceedsPromptBudget(budget, 5000, "tokens"),
    false,
    "token 口径会放行——这正是必须带单位的原因",
  );
});
