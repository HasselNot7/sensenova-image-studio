import assert from "node:assert/strict";
import { test } from "node:test";

import { SKILLS } from "./skills.generated";
import { exceedsPromptBudget, measureTextBudget } from "./prompt-budget";
import { PROVIDERS } from "./providers";
import { USER_NOTE_HEADING } from "./request-builder";
import {
  buildDistilledSendBody,
  buildMinimalSendBody,
  buildSendBody,
  findSkill,
  FULL_BODY_LEAK_BAN,
  isNoSkill,
  NO_SKILL,
  NO_SKILL_ID,
  resolveSendPrompt,
} from "./skills";

const FULL = "FULL_BODY_ORIGINAL";
const DISTILLED = "DISTILLED_BODY";
const MINIMAL = "MINIMAL_BODY";
const RESULT = "ONLINE_DISTILL_RESULT";

test("发送正文解析：蒸馏关 = 发源正文；蒸馏开 = 有结果用结果、没结果先发源正文", () => {
  // 蒸馏关
  const fullDirect = resolveSendPrompt({
    source: "full",
    distillOn: false,
    fullBody: FULL,
    distilledBody: DISTILLED,
    minimalBody: MINIMAL,
    distilledResult: null,
  });
  assert.ok(fullDirect.startsWith(FULL), "原文内容原样保留");
  assert.ok(fullDirect.includes("Off-screen direction"), "原文直发末尾拼防泄漏禁令");
  assert.equal(
    resolveSendPrompt({ source: "distilled", distillOn: false, fullBody: FULL, distilledBody: DISTILLED, minimalBody: MINIMAL, distilledResult: null }),
    DISTILLED,
  );
  assert.equal(
    resolveSendPrompt({ source: "minimal", distillOn: false, fullBody: FULL, distilledBody: DISTILLED, minimalBody: MINIMAL, distilledResult: null }),
    MINIMAL,
  );
  // 蒸馏开
  assert.equal(
    resolveSendPrompt({ source: "full", distillOn: true, fullBody: FULL, distilledBody: null, minimalBody: null, distilledResult: RESULT }),
    RESULT,
  );
  assert.equal(
    resolveSendPrompt({ source: "distilled", distillOn: true, fullBody: FULL, distilledBody: DISTILLED, minimalBody: MINIMAL, distilledResult: RESULT }),
    RESULT,
  );
  assert.equal(
    resolveSendPrompt({ source: "minimal", distillOn: true, fullBody: FULL, distilledBody: DISTILLED, minimalBody: MINIMAL, distilledResult: RESULT }),
    RESULT,
  );
  assert.equal(
    resolveSendPrompt({ source: "distilled", distillOn: true, fullBody: FULL, distilledBody: DISTILLED, minimalBody: MINIMAL, distilledResult: null }),
    DISTILLED,
    "蒸馏结果没回来前先显示源正文",
  );
});

test("发送正文解析：选中的档位没有对应正文时回退原文", () => {
  assert.equal(
    resolveSendPrompt({ source: "distilled", distillOn: false, fullBody: FULL, distilledBody: null, minimalBody: MINIMAL, distilledResult: null }),
    FULL,
  );
  assert.equal(
    resolveSendPrompt({ source: "minimal", distillOn: false, fullBody: FULL, distilledBody: DISTILLED, minimalBody: null, distilledResult: null }),
    FULL,
  );
});

test("原文禁令要顶住原文自己要求的固定署名（azhu 实测把作者名画在海报右下角）", () => {
  assert.ok(FULL_BODY_LEAK_BAN.includes("Off-screen direction"));
  assert.ok(FULL_BODY_LEAK_BAN.includes("fixed signature"), "必须显式覆盖固定署名");
  assert.ok(FULL_BODY_LEAK_BAN.includes("author"), "必须点名作者/@账号/版本号/网址");
  assert.ok(FULL_BODY_LEAK_BAN.includes("严禁出现本 Skill 的名称"));
});

test("内置正文不许出现 Skill 自己的名称、作者、版本号或推广网址", () => {
  for (const skill of SKILLS) {
    for (const tier of ["distilledBody", "minimalBody"] as const) {
      const body = skill[tier];
      assert.ok(body, `${skill.id} 缺少 ${tier}`);
      for (const token of [skill.name, skill.nameEn, skill.author]) {
        assert.ok(!body.includes(token), `${skill.id} 的 ${tier} 含身份字样：${token}`);
      }
      // 版本号形如 v1.3 / v0.23：一旦进正文，模型会把它当标题文字画出来
      assert.ok(!/\bv\d+\.\d+(\.\d+)?\b/.test(body), `${skill.id} 的 ${tier} 含版本号字样`);
      assert.ok(!/@[A-Za-z0-9_.-]+/.test(body.replace(/@handle/g, "")), `${skill.id} 的 ${tier} 含 @账号`);
      assert.ok(!/https?:\/\/\S/.test(body), `${skill.id} 的 ${tier} 含网址`);
    }
  }
});

test("极简版：SenseNova 两家与千问 3.0 都能免蒸馏直发，且严格短于精简版", () => {
  // 千问 2.0 系只有 1300 token，中文 Skill 的极简版仍可能超；那一档界面上如实标价并可开蒸馏。
  const models = PROVIDERS.flatMap((provider) => provider.models).filter(
    (model) => model.promptTokenLimit !== null && !/2\.0/.test(model.id),
  );
  assert.ok(models.length >= 4, "注册表里至少要有多家模型可测");
  for (const skill of SKILLS) {
    const minimal = measureTextBudget(skill.minimalBody as string);
    const distilled = measureTextBudget(skill.distilledBody as string);
    assert.ok(minimal.tokens < distilled.tokens, `${skill.id} 极简版没比精简版短`);
    for (const model of models) {
      assert.ok(
        !exceedsPromptBudget(minimal, model.promptTokenLimit as number, model.promptLimitUnit),
        `${skill.id} 极简版放不进 ${model.id}（${minimal.chars} 字符 / ~${minimal.tokens} token vs ${model.promptTokenLimit} ${model.promptLimitUnit}）`,
      );
    }
  }
});

test("无 Skill 模式：正文 = 用户自己写的那段话，一个字都不加", () => {
  const mine = "  竖幅海报，钴蓝单强调色，标题 quiet harbor  ";
  assert.equal(buildSendBody(NO_SKILL, mine), mine.trim(), "去掉首尾空白，其余原样");
  assert.equal(isNoSkill(NO_SKILL), true);
  assert.equal(findSkill(NO_SKILL_ID), NO_SKILL, "哨兵 id 要能被 findSkill 解析到");
  // 无 Skill 没有内置正文，所以也没有精简版/极简版/蒸馏档位可谈
  assert.equal(buildDistilledSendBody(NO_SKILL, mine), null);
  assert.equal(buildMinimalSendBody(NO_SKILL, mine), null);
  assert.equal(NO_SKILL.body, "");
  assert.equal(NO_SKILL.promptParts.length, 0);
  assert.equal(NO_SKILL.inputImages.min, 0, "参考照片必须可选，否则纯提示词出图被卡住");

  const resolved = resolveSendPrompt({
    source: "full",
    distillOn: true,
    noSkill: true,
    fullBody: mine.trim(),
    distilledBody: null,
    minimalBody: null,
    distilledResult: RESULT,
  });
  assert.equal(resolved, mine.trim(), "开着蒸馏开关也发用户原话");
  assert.ok(!resolved.includes("Off-screen direction"), "防泄漏禁令不许拼进用户自己的提示词");
  assert.ok(!resolved.includes(USER_NOTE_HEADING), "不要再套一层「用户本次补充要求」标题");

  // 真 Skill 走原来的装配路径，别被无 Skill 分支带偏
  const real = SKILLS[0];
  const assembled = buildSendBody(real, "只要一句标语");
  assert.ok(assembled.startsWith(real.body.trim()));
  assert.ok(assembled.includes(USER_NOTE_HEADING));
});
