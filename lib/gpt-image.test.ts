import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GPT_IMAGE_EDITS_PATH,
  GPT_IMAGE_GENERATIONS_PATH,
  GPT_IMAGE_MODELS,
  buildGptImagePayload,
  validateGptImageArbitrarySize,
  validateGptImagePayload,
} from "./gpt-image";
import { findModelById, resolveProviderBaseUrl } from "./providers";
import { buildStudioRequest, type StudioParams } from "./request-builder";

const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function params(over: Partial<StudioParams> = {}): StudioParams {
  return {
    providerId: "openai",
    model: "gpt-image-2.5-sunburst",
    prompt: "一张海报",
    images: [],
    size: "auto",
    n: 1,
    negativePrompt: "",
    promptExtend: false,
    promptExtendMode: "direct",
    enableThinking: false,
    watermark: false,
    seed: "",
    ...over,
  };
}

function request(over: Partial<StudioParams> = {}) {
  const built = buildStudioRequest(params(over));
  return built;
}

test("GPT Image 文生图：只发规范里存在的字段，auto 就是不发 size", () => {
  const built = buildGptImagePayload(request());
  assert.equal(built.path, GPT_IMAGE_GENERATIONS_PATH);
  assert.deepEqual(built.body, { model: "gpt-image-2.5-sunburst", prompt: "一张海报", n: 1 });
  // 千问 / SenseNova 专属字段绝不能渗进来（上游会 400）
  for (const key of ["watermark", "negative_prompt", "seed", "prompt_extend", "size"]) {
    assert.equal(key in built.body, false, `不该发送 ${key}`);
  }
});

test("GPT Image 图生图：走 edits，images 是 {image_url} 数组且保留 Data-URL", () => {
  const built = buildGptImagePayload(request({ images: [DATA_URL, "https://x.test/a.png"], size: "1024x1536", n: 3 }));
  assert.equal(built.path, GPT_IMAGE_EDITS_PATH);
  assert.deepEqual(built.body, {
    model: "gpt-image-2.5-sunburst",
    prompt: "一张海报",
    n: 3,
    size: "1024x1536",
    images: [{ image_url: DATA_URL }, { image_url: "https://x.test/a.png" }],
  });
});

test("GPT Image 的 n 夹进 1~10", () => {
  assert.equal(buildGptImagePayload(request({ n: 12 })).body.n, 10);
  assert.equal(buildGptImagePayload(request({ n: 0 })).body.n, 1);
});

test("任意尺寸规则：16 倍数、比例 ≤3:1、≤3840x2160，写法是字母 x 不是星号", () => {
  assert.equal(validateGptImageArbitrarySize("1536x864"), null);
  assert.equal(validateGptImageArbitrarySize("3840x2160"), null, "边界值本身合法");
  assert.match(String(validateGptImageArbitrarySize("1535x864")), /16 的倍数/);
  assert.match(String(validateGptImageArbitrarySize("4000x1024")), /1:3 ~ 3:1|3840x2160/);
  assert.match(String(validateGptImageArbitrarySize("3840x2176")), /3840x2160/);
  assert.match(String(validateGptImageArbitrarySize("1536*864")), /WIDTHxHEIGHT/, "星号写法必须拒");
  assert.match(String(validateGptImageArbitrarySize("auto")), /WIDTHxHEIGHT/);
});

test("代理侧校验：越界字段、超长 prompt、错端点都拒发", () => {
  const ok = { model: "gpt-image-2.5-flare", prompt: "p", n: 1, size: "1536x864" };
  assert.equal(validateGptImagePayload(ok, GPT_IMAGE_GENERATIONS_PATH), null);
  assert.deepEqual(
    validateGptImagePayload({ ...ok, watermark: false }, GPT_IMAGE_GENERATIONS_PATH),
    { field: "watermark", message: "gpt-image-2.5-flare 不支持参数 \"watermark\"，禁止发送未定义字段" },
  );
  assert.equal(
    validateGptImagePayload({ ...ok, prompt: "x".repeat(32001) }, GPT_IMAGE_GENERATIONS_PATH)?.field,
    "prompt",
  );
  assert.equal(
    validateGptImagePayload({ ...ok, size: "1535x864" }, GPT_IMAGE_GENERATIONS_PATH)?.field,
    "size",
    "阳性对照：16 倍数规则真的在拦",
  );
  assert.equal(
    validateGptImagePayload({ model: "gpt-image-2", prompt: "p" }, GPT_IMAGE_GENERATIONS_PATH)?.field,
    "model",
    "没挂进注册表的模型（含 gpt-image-2）一律拒",
  );
  assert.equal(
    validateGptImagePayload({ ...ok, images: [{ image_url: "ftp://x" }] }, GPT_IMAGE_EDITS_PATH)?.field,
    "images",
  );
  assert.equal(
    validateGptImagePayload({ ...ok, images: [] }, GPT_IMAGE_EDITS_PATH)?.field,
    "images",
  );
  assert.equal(
    validateGptImagePayload(
      { ...ok, images: Array.from({ length: 17 }, () => ({ image_url: DATA_URL })) },
      GPT_IMAGE_EDITS_PATH,
    )?.field,
    "images",
    "超过 16 张要拒",
  );
  assert.equal(
    validateGptImagePayload({ ...ok, images: [{ image_url: DATA_URL }] }, GPT_IMAGE_EDITS_PATH),
    null,
  );
});

test("注册表：只挂 2.5 系两个模型，能力位按规范取值", () => {
  assert.deepEqual(
    GPT_IMAGE_MODELS.map((model) => model.id),
    ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"],
  );
  for (const model of GPT_IMAGE_MODELS) {
    const found = findModelById(model.id);
    assert.equal(found?.provider.id, "openai");
    assert.equal(found?.model.promptLimitUnit, "chars");
    assert.equal(found?.model.promptTokenLimit, 32000);
    assert.equal(found?.model.maxN, 10);
    assert.equal(found?.model.maxInputImages, 16);
    assert.equal(found?.model.supportsWatermark, false);
    assert.equal(found?.model.supportsNegativePrompt, false);
    assert.equal(found?.model.supportsSeed, false);
    assert.equal(found?.model.sizeSeparator, "x");
    assert.equal(found?.model.validateSize("1536x864"), null);
  }
});

test("上游地址：留空走官方，填网关要带协议且尾斜杠会被去掉", () => {
  assert.deepEqual(resolveProviderBaseUrl("openai", {}), {
    baseUrl: "https://api.openai.com/v1",
    error: null,
  });
  assert.equal(
    resolveProviderBaseUrl("openai", { baseUrl: "https://gw.example.com/v1/" }).baseUrl,
    "https://gw.example.com/v1",
  );
  const bad = resolveProviderBaseUrl("openai", { baseUrl: "gw.example.com/v1" });
  assert.equal(bad.baseUrl, null);
  assert.match(String(bad.error), /http/);
});
