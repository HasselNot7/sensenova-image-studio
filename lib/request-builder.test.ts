import assert from "node:assert/strict";
import { test } from "node:test";

import { U1_FAST, U1_LITE } from "./models";
import {
  buildEditRequest,
  buildGenerationRequest,
  validateEditPayload,
  validateGenerationPayload,
} from "./request-builder";

test("u1-fast 文生图请求体：仅官方 5 字段，禁止 response_format/output_format/prompt_extend", () => {
  const request = buildGenerationRequest({
    model: U1_FAST,
    prompt: " 一只戴宇航员头盔的橘猫 ",
    size: "2752x1536",
    watermark: false,
    outputFormat: "png",
    responseFormat: "url",
    promptExtend: true,
  });
  assert.deepEqual(Object.keys(request).sort(), [
    "model",
    "n",
    "prompt",
    "size",
    "watermark",
  ]);
  assert.equal(request.model, "sensenova-u1-fast");
  assert.equal(request.prompt, "一只戴宇航员头盔的橘猫");
  assert.equal(request.n, 1);
  assert.equal(request.watermark, false);
});

test("u1.5-lite 文生图请求体：全量 8 字段且 watermark 显式", () => {
  const request = buildGenerationRequest({
    model: U1_LITE,
    prompt: "雪后的故宫",
    size: "2720x1536",
    watermark: true,
    outputFormat: "webp",
    responseFormat: "url",
    promptExtend: false,
  });
  assert.deepEqual(Object.keys(request).sort(), [
    "model",
    "n",
    "output_format",
    "prompt",
    "prompt_extend",
    "response_format",
    "size",
    "watermark",
  ]);
  assert.equal(request.model, "sensenova-u1.5-lite");
  assert.equal(request.size, "2720x1536");
  assert.equal(request.output_format, "webp");
  assert.equal(request.response_format, "url");
  assert.equal(request.prompt_extend, false);
});

test("u1.5-lite 图片编辑请求体：images[].image_url + 契约字段", () => {
  const request = buildEditRequest({
    imageUrl: "https://example.com/ref.png",
    prompt: " 把衣服换成红色羽绒服 ",
    size: "auto",
    watermark: true,
    responseFormat: "b64_json",
    promptExtend: true,
  });
  assert.deepEqual(Object.keys(request).sort(), [
    "images",
    "model",
    "n",
    "prompt",
    "prompt_extend",
    "response_format",
    "size",
    "watermark",
  ]);
  assert.equal(request.model, "sensenova-u1.5-lite");
  assert.deepEqual(request.images, [{ image_url: "https://example.com/ref.png" }]);
  assert.equal(request.prompt, "把衣服换成红色羽绒服");
  assert.equal(request.n, 1);
});

test("服务端校验：拒绝给 u1-fast 发送不支持字段", () => {
  const issue = validateGenerationPayload({
    model: "sensenova-u1-fast",
    prompt: "hi",
    size: "2048x2048",
    n: 1,
    watermark: true,
    response_format: "url",
  });
  assert.ok(issue);
  assert.match(issue.message, /response_format/);
});

test("服务端校验：u1.5-lite 合法请求通过", () => {
  const issue = validateGenerationPayload({
    model: "sensenova-u1.5-lite",
    prompt: "小猫",
    size: "2048x2048",
    n: 1,
    watermark: true,
    output_format: "png",
    response_format: "b64_json",
    prompt_extend: true,
  });
  assert.equal(issue, null);
});

test("服务端校验：edits 拒绝无前缀纯 Base64 与非 http(s) 链接", () => {
  const base = {
    model: "sensenova-u1.5-lite",
    prompt: "改背景",
    n: 1,
    size: "auto",
    watermark: true,
    prompt_extend: true,
    response_format: "b64_json",
  };
  assert.ok(
    validateEditPayload({ ...base, images: [{ image_url: "SGVsbG8gd29ybGQ=" }] }),
  );
  assert.ok(
    validateEditPayload({ ...base, images: [{ image_url: "ftp://a.com/b.png" }] }),
  );
  assert.equal(
    validateEditPayload({
      ...base,
      images: [{ image_url: "data:image/png;base64,SGVsbG8gd29ybGQ=" }],
    }),
    null,
  );
});
