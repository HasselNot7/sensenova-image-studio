"use client";

import {
  Alert,
  Button,
  Card,
  Chip,
  Description,
  FieldError,
  Header,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Switch,
  TextArea,
  TextField,
  toast,
  type Key,
} from "@heroui/react";
import { BookOpen, Eye, Sparkles } from "@gravity-ui/icons";
import { useMemo, useState, useSyncExternalStore } from "react";

import { ImagePicker } from "@/components/image-picker";
import { OptionSwitch, SimpleSelect, SizeField } from "@/components/form-controls";
import { BlurText } from "@/components/reactbits/BlurText";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { Magnet } from "@/components/reactbits/Magnet";
import { ShinyText } from "@/components/reactbits/ShinyText";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { ResultView } from "@/components/result-view";
import { SkillSelect } from "@/components/skill-select";
import { useOpenSettings } from "@/components/settings-context";
import { getDistillConfig, readProvider, subscribeBrowserConfig } from "@/lib/browser-config";
import { requestDistill, requestProviderImage } from "@/lib/api-client";
import { distillCacheKey, recallDistillStable, rememberDistillEntry } from "@/lib/distill-cache";
import { distillTargetTokens } from "@/lib/distill";
import { QWEN_INPUT_IMAGE } from "@/lib/models";
import { findModelById, PROVIDERS } from "@/lib/providers";
import { createHistoryItem, PROMPT_HEAD_CHARS, type HistoryInput } from "@/lib/history";
import type { PreparedImage } from "@/lib/image-input";
import { exceedsPromptBudget, measureTextBudget, type TextBudget } from "@/lib/prompt-budget";
import {
  AUTO_SIZE,
  CUSTOM_SIZE_VALUE,
  NEGATIVE_PROMPT_MAX_CHARS,
  SEED_MAX,
  validateCustomSize,
  type PromptExtendMode,
} from "@/lib/models";
import {
  buildProviderPayload,
  buildStudioRequest,
  validateStudioParams,
  type StudioRequest,
} from "@/lib/request-builder";
import { prepareImageInput } from "@/lib/image-input";
import {
  buildDistilledSendBody,
  buildMinimalSendBody,
  buildSendBody,
  isNoSkill,
  NO_SKILL_ID,
  resolveSendPrompt,
  SKILLS,
  type SendBodySource,
} from "@/lib/skills";
import type { SkillDefinition } from "@/lib/skill-types";
import type { ApiFailure } from "@/lib/errors";

const N_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => ({
  value: String(value),
  label: String(value),
  ...(value === 1 ? { note: "（默认）" } : {}),
}));

const EXTEND_MODE_OPTIONS = [
  { value: "direct", label: "direct", note: "（DPE，文生图与图生图都支持）" },
  { value: "agent", label: "agent", note: "（APE，仅文生图，带图会 400）" },
];

interface StudioPanelProps {
  skill: SkillDefinition;
  model: string;
  onModelChange: (model: string) => void;
  onSkillChange: (id: string) => void;
  onHistoryAdd: (item: HistoryInput) => void;
}

type BodySource = SendBodySource;
const BODY_SOURCE_LABEL: Record<BodySource, string> = {
  full: "原文",
  distilled: "精简版",
  minimal: "极简版",
};

/**
 * 蒸馏结果的缓存键：只由「源正文 + 蒸馏模型 + 目标长度与单位」决定，跟换哪张照片无关。
 * 面板回显与 handleSubmit 共用这一个函数——分开算会出现标着已蒸馏、实发源正文。
 */
function distillKeyFor(
  source: string,
  modelLimit: number | null,
  unit: "tokens" | "chars",
): string | null {
  const config = getDistillConfig();
  const target = distillTargetTokens(modelLimit, config.targetTokens);
  if (config.model.length === 0 || target === null) {
    return null;
  }
  return distillCacheKey({ source, model: config.model, target, unit });
}

export function StudioPanel({ model, onHistoryAdd, onModelChange, onSkillChange, skill }: StudioPanelProps) {
  const openSettings = useOpenSettings();
  const noSkill = isNoSkill(skill);
  const found = findModelById(model);
  const modelInfo = found?.model;
  const currentProvider = found?.provider;
  const tokenLimit = modelInfo?.promptTokenLimit ?? null;
  const limitUnit = modelInfo?.promptLimitUnit ?? "tokens";
  const limitLabel = limitUnit === "chars" ? "字符" : "token";
  const allowCustomSize =
    modelInfo?.sizePresets.some((option) => option.value === CUSTOM_SIZE_VALUE) === true;
  const keyConfigured = useSyncExternalStore(
    subscribeBrowserConfig,
    () => (currentProvider ? String(readProvider(currentProvider.id)?.usable === true) : "unknown"),
    () => "unknown",
  );

  const [userNote, setUserNote] = useState("");
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [maxEdge, setMaxEdge] = useState<number>(QWEN_INPUT_IMAGE.defaultMaxEdge);
  const [uncompressed, setUncompressed] = useState(false);
  const [size, setSize] = useState<string>(AUTO_SIZE);
  const [customSize, setCustomSize] = useState("");
  const [count, setCount] = useState("1");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [promptExtend, setPromptExtend] = useState(false);
  const [promptExtendMode, setPromptExtendMode] = useState<PromptExtendMode>("direct");
  const [enableThinking, setEnableThinking] = useState(true);
  const [watermark, setWatermark] = useState(false);
  const [seed, setSeed] = useState("");

  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [distilling, setDistilling] = useState(false);
  const [results, setResults] = useState<{ image: string; createdAtMs: number }[]>([]);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [lastRequest, setLastRequest] = useState<{
    request: StudioRequest;
    sendMethod: string;
  } | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [sourceOverride, setSourceOverride] = useState<BodySource | null>(null);
  const [distillOn, setDistillOn] = useState(false);

  const fullBody = useMemo(() => buildSendBody(skill, userNote), [skill, userNote]);
  const distilledSendBody = useMemo(() => buildDistilledSendBody(skill, userNote), [skill, userNote]);
  const minimalSendBody = useMemo(() => buildMinimalSendBody(skill, userNote), [skill, userNote]);
  const distilledBudget = useMemo(
    () => (distilledSendBody ? measureTextBudget(distilledSendBody) : null),
    [distilledSendBody],
  );
  const minimalBudget = useMemo(
    () => (minimalSendBody ? measureTextBudget(minimalSendBody) : null),
    [minimalSendBody],
  );
  const fullBudget = useMemo(() => measureTextBudget(fullBody), [fullBody]);
  const fits = (budget: TextBudget | null) =>
    budget !== null &&
    (tokenLimit === null || !exceedsPromptBudget(budget, tokenLimit, limitUnit));
  const sourceOptions = [
    { value: "full" as BodySource, label: "原文" },
    ...(distilledSendBody && distilledBudget
      ? [{ value: "distilled" as BodySource, label: "精简版" }]
      : []),
    ...(minimalSendBody && minimalBudget
      ? [{ value: "minimal" as BodySource, label: "极简版" }]
      : []),
  ];
  // 默认源：有精简版默认精简版——原文是排好版的教学文档，图像模型会把章节标题、
  // 示例词当海报文案画出来（实测泄漏）；想看全文效果可手动切回原文。
  // 精简版装不进当前模型时自动退到极简版，这样 SenseNova 不必先在线蒸馏。
  const autoSource: BodySource = !distilledSendBody
    ? "full"
    : fits(distilledBudget) || !minimalSendBody
      ? "distilled"
      : "minimal";
  const effectiveSource: BodySource =
    sourceOverride && sourceOptions.some((option) => option.value === sourceOverride)
      ? sourceOverride
      : autoSource;
  const sourceBody =
    effectiveSource === "minimal" && minimalSendBody
      ? minimalSendBody
      : effectiveSource === "distilled" && distilledSendBody
        ? distilledSendBody
        : fullBody;
  // 蒸馏结果只由「源正文 + 蒸馏模型 + 目标长度与单位」决定：换照片、改尺寸、刷新页面
  // 都不该再等一次上游，所以按内容键查缓存，而不是把结果锁在组件 state 里。
  const distillHit = useSyncExternalStore(
    subscribeBrowserConfig,
    () => recallDistillStable(window.localStorage, distillKeyFor(sourceBody, tokenLimit, limitUnit)),
    () => null,
  );
  const sendBody = resolveSendPrompt({
    source: effectiveSource,
    distillOn,
    noSkill,
    fullBody,
    distilledBody: distilledSendBody,
    minimalBody: minimalSendBody,
    distilledResult: distillHit?.text ?? null,
  });
  const budget = useMemo(() => measureTextBudget(sendBody), [sendBody]);
  const bodyChipLabel = noSkill ? "提示词" : BODY_SOURCE_LABEL[effectiveSource];
  const sourceBudget =
    effectiveSource === "minimal" && minimalBudget
      ? minimalBudget
      : effectiveSource === "distilled" && distilledBudget
        ? distilledBudget
        : fullBudget;
  const overBudget = tokenLimit !== null && exceedsPromptBudget(sourceBudget, tokenLimit, limitUnit);
  const needsImageButModelCant = skill.inputImages.min > 0 && modelInfo?.acceptsImages === false;
  const missingImages = images.length < skill.inputImages.min;
  const finalSize = size === CUSTOM_SIZE_VALUE ? customSize.trim() : size;
  const busy = loading || preparing || distilling;
  const busyLabel = loading
    ? "生成中…"
    : distilling
      ? "蒸馏中…"
      : preparing
        ? "处理图片…"
        : noSkill
          ? "直接出图"
          : "用这个 Skill 出图";

  const send = async (sent: { request: StudioRequest; sendMethod: string }) => {
    const { request, sendMethod } = sent;
    setLoading(true);
    setFailure(null);
    setLastRequest(sent);
      const call = buildProviderPayload(request);
      const response = await requestProviderImage(request.providerId, call.body);
      setLoading(false);
      if (response.ok) {
        const createdAtMs = response.created * 1000;
        const items = response.images.map((image) => ({ image, createdAtMs }));
        setResults(items);
        toast.success(`出图成功 ${response.images.length} 张`, {
          description: "上游链接 24 小时过期，已转存为 Data-URL 写入历史",
        });
        response.images.forEach((image, index) => {
          const params: HistoryInput["params"] = {
            Skill: skill.name,
            尺寸: request.size,
            张数: `${request.n}（本张第 ${index + 1}）`,
            水印: request.watermark ? "开" : "关",
            提示词润色: request.prompt_extend ? `开 · ${request.prompt_extend_mode ?? "direct"}` : "关",
            输入图: `${request.images.length} 张`,
            正文: `${request.prompt.length} 字符`,
            发送方式: sendMethod,
          };
          if (request.seed !== undefined) {
            params.seed = request.seed;
          }
          onHistoryAdd(
            createHistoryItem({
              skillId: skill.id,
              skillName: skill.name,
              model: request.model,
              userNote: userNote.trim(),
              promptChars: request.prompt.length,
              promptHead: request.prompt.slice(0, PROMPT_HEAD_CHARS),
              params,
              image,
            }),
          );
        });
      } else {
        setResults([]);
        setFailure(response.failure);
        const isConfigError = response.failure.type === "config_error" || response.failure.code === "401";
        toast.danger(response.failure.hint, {
          description: response.failure.message,
          ...(isConfigError
            ? {
                timeout: 0,
                actionProps: {
                  children: "打开设置",
                  onPress: () => openSettings(request.providerId),
                  variant: "tertiary" as const,
                },
              }
            : {}),
        });
      }
  };

  const handleSubmit = () => {
    if (missingImages) {
      toast.danger("还缺参考照片", {
        description: `「${skill.name}」要 ${skill.inputImages.min} 张实拍图作为内容来源，先上传再生成`,
      });
      return;
    }
    void (async () => {
      setPreparing(true);
      // Skill 自带的示例海报只给人看，绝不发给图像模型：图像模型把每张输入图都当内容，
      // 会把示例整张抄进结果（钟塔、星形、示例上的文字都会重现）。
      const policy = modelInfo?.inputImage ?? QWEN_INPUT_IMAGE;
      const prepared: PreparedImage[] = [];
      try {
        for (const item of images) {
          prepared.push(
            await prepareImageInput(
              item.file ?? item.dataUrl,
              item.name,
              policy,
              maxEdge,
              item.file,
              uncompressed,
            ),
          );
        }
      } catch (error) {
        setPreparing(false);
        toast.danger("输入图重算失败", {
          description: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      setImages(prepared);
      const allImages = prepared.map((item) => item.dataUrl);
      setPreparing(false);
      let promptText = resolveSendPrompt({
        source: effectiveSource,
        distillOn,
        noSkill,
        fullBody,
        distilledBody: distilledSendBody,
        minimalBody: minimalSendBody,
        distilledResult: distillHit?.text ?? null,
      });
      const sourceStats =
        effectiveSource === "distilled"
          ? skill.distilledStats
          : effectiveSource === "minimal"
            ? skill.minimalStats
            : null;
      let sendMethod = noSkill
        ? "自写提示词"
        : sourceStats
          ? `${BODY_SOURCE_LABEL[effectiveSource]}（内置，${sourceStats.chars} 字符）`
          : "原文直发";
      if (distillOn && !noSkill) {
        if (distillHit) {
          promptText = distillHit.text;
          sendMethod = `在线蒸馏（${distillHit.model}，源 ${distillHit.fromChars} 字符）`;
        } else {
          setDistilling(true);
          const result = await requestDistill({
            skillBody:
              effectiveSource === "distilled"
                ? (skill.distilledBody ?? skill.body)
                : effectiveSource === "minimal"
                  ? (skill.minimalBody ?? skill.body)
                  : skill.body,
            userNote,
            modelLimit: tokenLimit,
            promptLimitUnit: limitUnit,
          });
          setDistilling(false);
          if (!result.ok) {
            setFailure(result.failure);
            toast.danger(result.failure.hint, { description: result.failure.message });
            return;
          }
          const distillModel = getDistillConfig().model;
          promptText = result.text;
          sendMethod = `在线蒸馏（${distillModel}，源 ${result.originalChars} 字符）`;
          const key = distillKeyFor(sourceBody, tokenLimit, limitUnit);
          if (key !== null) {
            rememberDistillEntry(window.localStorage, key, {
              text: result.text,
              fromChars: result.originalChars,
              model: distillModel,
            });
          }
        }
      }
      const issue = validateStudioParams({
        customSize,
        enableThinking,
        images: allImages,
        model,
        providerId: currentProvider?.id ?? "",
        n: Number(count),
        negativePrompt,
        prompt: promptText,
        promptExtend,
        promptExtendMode,
        seed,
        size: finalSize,
        watermark,
      });
      if (issue) {
        setPreparing(false);
        toast.danger("请先修正参数", { description: issue.message });
        return;
      }
      const request = buildStudioRequest({
        enableThinking,
        images: allImages,
        model,
        providerId: currentProvider?.id ?? "",
        n: Number(count),
        negativePrompt,
        prompt: promptText,
        promptExtend,
        promptExtendMode,
        seed,
        size: finalSize,
        watermark,
      });
      setPreparing(false);
      await send({ request, sendMethod });
    })();
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <FadeIn className="h-full">
        <SpotlightCard className="h-full">
          <Card className="h-full rounded-card border border-border p-6">
            <Card.Header className="gap-1">
              <Card.Title className="text-[15px] font-semibold">
                <BlurText delay={0}>{skill.name} · 输入与参数</BlurText>
              </Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-5">
              <SkillSelect
                isDisabled={loading}
                limitUnit={limitUnit}
                onChange={(id) => {
                  onSkillChange(id);
                  setSourceOverride(null);
                  if (id === NO_SKILL_ID) {
                    setDistillOn(false);
                  }
                }}
                skills={SKILLS}
                tokenLimit={tokenLimit}
                value={skill.id}
              />

              {noSkill ? null : (
                <div className="-mt-3 flex flex-wrap items-center gap-1.5">
                  {skill.tags.map((tag) => (
                    <span
                      className="rounded-pill bg-surface-secondary px-2 py-0.5 text-[11.5px] text-muted"
                      key={tag}
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="text-[11.5px] text-muted">
                    作者 {skill.author} · {skill.license}
                  </span>
                </div>
              )}

              {modelInfo?.acceptsImages ? (
                <div className="flex flex-col gap-2">
                  <Label className="text-[13px] font-medium text-foreground/80">
                    参考照片{skill.inputImages.min > 0 ? "" : "（可选）"}
                  </Label>
                  <ImagePicker
                    bundled={skill.bundledImages}
                    images={images}
                    isDisabled={loading}
                    maxCount={Math.min(modelInfo?.maxInputImages ?? 3, skill.inputImages.max)}
                    onChange={setImages}
                    onBusyChange={setPreparing}
                    onEdgeChange={(edge, nextUncompressed) => {
                      setMaxEdge(edge);
                      setUncompressed(nextUncompressed);
                      const policy = modelInfo?.inputImage;
                      if (!policy || images.length === 0) {
                        return;
                      }
                      void (async () => {
                        setPreparing(true);
                        const next: PreparedImage[] = [];
                        for (const item of images) {
                          try {
                            next.push(
                              await prepareImageInput(
                                item.file ?? item.dataUrl,
                                item.name,
                                policy,
                                edge,
                                item.file,
                                nextUncompressed,
                              ),
                            );
                          } catch {
                            next.push(item);
                          }
                        }
                        setImages(next);
                        setPreparing(false);
                      })();
                    }}
                    policy={modelInfo?.inputImage ?? QWEN_INPUT_IMAGE}
                    maxEdge={maxEdge}
                    uncompressed={uncompressed}
                  />
                  {missingImages ? (
                    <FieldError>这张 Skill 需要至少 {skill.inputImages.min} 张照片作为内容来源</FieldError>
                  ) : null}
                </div>
              ) : null}

              {needsImageButModelCant ? (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{modelInfo?.id} 不支持输入图</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField isDisabled={loading} value={userNote} onChange={setUserNote}>
                <Label className="text-[13px] font-medium text-foreground/80">
                  {noSkill ? "提示词" : "本次补充（可选）"}
                </Label>
                <TextArea
                  placeholder={skill.userNotePlaceholder ?? "想对这次出图额外说点什么"}
                  rows={noSkill ? 6 : 3}
                />
              </TextField>

              <div className="flex flex-wrap items-center gap-2 rounded-control bg-surface-secondary p-3">
                {noSkill ? null : (
                  <Chip size="sm" variant="tertiary">
                    <BookOpen className="me-1 size-3.5" />
                    {skill.promptParts.length} 段原文 · {fullBudget.chars} 字符
                  </Chip>
                )}
                <Chip
                  color={distillHit ? "accent" : overBudget && !distillOn ? "danger" : "success"}
                  size="sm"
                  variant="soft"
                >
                  {distillOn
                    ? distillHit
                      ? `已在线蒸馏 → ${budget.chars} 字符`
                      : `待蒸馏源 ${sourceBody.length} 字符`
                    : tokenLimit === null
                      ? `${bodyChipLabel} · ${budget.chars} 字符`
                      : limitUnit === "chars"
                        ? `${bodyChipLabel} · ${budget.chars} / ${tokenLimit} 字符`
                        : `${bodyChipLabel} · 估算 ${budget.tokens} / ${tokenLimit} token`}
                </Chip>
                <div className="ms-auto flex max-w-full flex-wrap items-center justify-end gap-2">
                  {noSkill ? null : (
                    <>
                      <SimpleSelect
                        className="min-w-[128px]"
                        isDisabled={busy}
                        options={sourceOptions}
                        value={effectiveSource}
                        onChange={(value) => setSourceOverride(value as BodySource)}
                      />
                      <Switch className="shrink-0" isSelected={distillOn} onChange={setDistillOn} isDisabled={busy}>
                        <Switch.Content>
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                          <span className="whitespace-nowrap">蒸馏后发送</span>
                        </Switch.Content>
                      </Switch>
                      {distillOn && distillHit ? (
                        <Button size="sm" variant="ghost" onPress={() => setDistillOn(false)}>
                          <span className="whitespace-nowrap">用回源正文</span>
                        </Button>
                      ) : null}
                    </>
                  )}
                  <Button size="sm" variant="tertiary" onPress={() => setBodyOpen(true)}>
                    <Eye />
                    <span className="whitespace-nowrap">查看发送正文</span>
                  </Button>
                </div>
              </div>

              {overBudget && !distillOn ? (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>正文超出该模型的提示词建议上限</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2">
                <Select
                  value={model}
                  onChange={(key: Key | null) => {
                    if (typeof key !== "string") {
                      return;
                    }
                    const picked = findModelById(key);
                    onModelChange(key);
                    setSourceOverride(null);
                    if (picked) {
                      setSize(picked.model.defaultSize);
                      setCustomSize("");
                      setCount("1");
                      const policy = picked.model.inputImage;
                      const nextEdge = Math.min(maxEdge, policy.maxEdgeCeiling);
                      setMaxEdge(nextEdge);
                      setUncompressed(false);
                      // 换模型 = 换输入图策略，已传的照片要按新上限立刻重算，
                      // 否则缩略图标着 2600×1400、真发出去的却是 2048，两边对不上
                      if (images.length > 0) {
                        void (async () => {
                          setPreparing(true);
                          const next: PreparedImage[] = [];
                          for (const item of images) {
                            try {
                              next.push(
                                await prepareImageInput(
                                  item.file ?? item.dataUrl,
                                  item.name,
                                  policy,
                                  nextEdge,
                                  item.file,
                                  false,
                                ),
                              );
                            } catch {
                              next.push(item);
                            }
                          }
                          setImages(next);
                          setPreparing(false);
                        })();
                      }
                    }
                  }}
                >
                  <Label className="text-[13px] font-medium text-foreground/80">模型</Label>
                  <Select.Trigger>
                    <Select.Value>
                      {() => <span className="tech text-[13.5px]">{model}</span>}
                    </Select.Value>
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {PROVIDERS.map((provider) => (
                        <ListBox.Section key={provider.id}>
                          <Header>{provider.name}</Header>
                          {provider.models.map((item) => (
                            <ListBox.Item key={item.id} id={item.id} textValue={item.id}>
                              <div className="flex flex-col">
                                <span className="tech text-[13.5px]">{item.id}</span>
                                <span className="text-[11.5px] text-muted">{item.description}</span>
                              </div>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox.Section>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
                <div className="-mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] text-muted">
                    服务商 {currentProvider?.name ?? "未知"}
                    {tokenLimit === null ? "" : ` · 提示词建议 ≤${tokenLimit} ${limitLabel}`}
                  </span>
                  {keyConfigured === "false" ? (
                    <Button size="sm" variant="tertiary" onPress={() => openSettings(currentProvider?.id)}>
                      去填 {currentProvider?.shortName} 密钥
                    </Button>
                  ) : null}
                </div>
              </div>

              <SizeField
                allowCustom={allowCustomSize}
                customValue={customSize}
                isDisabled={loading}
                label="尺寸"
                onCustomChange={setCustomSize}
                onChange={setSize}
                options={modelInfo?.sizePresets ?? []}
                sizeSeparator={modelInfo?.sizeSeparator ?? "*"}
                validateCustom={modelInfo?.validateSize ?? validateCustomSize}
                value={size === AUTO_SIZE && modelInfo && modelInfo.defaultSize !== AUTO_SIZE ? modelInfo.defaultSize : size}
              />

              {modelInfo?.supportsNegativePrompt ? (
              <TextField
                isDisabled={loading}
                value={negativePrompt}
                onChange={setNegativePrompt}
              >
                <Label className="text-[13px] font-medium text-foreground/80">反向提示词（可选）</Label>
                <Input placeholder="例如：低分辨率、肢体畸形、文字模糊" />
                <Description
                  className={`text-right text-xs leading-relaxed ${
                    negativePrompt.length > NEGATIVE_PROMPT_MAX_CHARS ? "text-danger" : ""
                  }`}
                >
                  {negativePrompt.length} / {NEGATIVE_PROMPT_MAX_CHARS} 字符
                </Description>
              </TextField>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {modelInfo?.supportsPromptExtend ? (
                  <OptionSwitch
                    isDisabled={loading}
                    label="提示词润色 prompt_extend"
                    onChange={setPromptExtend}
                    selected={promptExtend}
                  />
                ) : null}
                {modelInfo?.supportsWatermark ? (
                  <OptionSwitch
                    isDisabled={loading}
                    label="水印 watermark"
                    onChange={setWatermark}
                    selected={watermark}
                  />
                ) : null}
                {promptExtend && modelInfo?.supportsPromptExtendMode ? (
                  <SimpleSelect
                    isDisabled={loading}
                    label="润色模式"
                    onChange={(value) => setPromptExtendMode(value as PromptExtendMode)}
                    options={
                      images.length > 0 ? EXTEND_MODE_OPTIONS.slice(0, 1) : EXTEND_MODE_OPTIONS
                    }
                    value={promptExtendMode}
                  />
                ) : null}
                {promptExtend && modelInfo?.supportsEnableThinking ? (
                  <OptionSwitch
                    isDisabled={loading}
                    label="深度思考 enable_thinking"
                    onChange={setEnableThinking}
                    selected={enableThinking}
                  />
                ) : null}
                {modelInfo && modelInfo.maxN > 1 ? (
                  <SimpleSelect
                    isDisabled={loading}
                    label="生成张数"
                    onChange={setCount}
                    options={N_OPTIONS.slice(0, modelInfo.maxN)}
                    value={count}
                  />
                ) : null}
                {modelInfo?.supportsSeed ? (
                  <TextField isDisabled={loading} value={seed} onChange={setSeed}>
                    <Label className="text-[13px] font-medium text-foreground/80">seed</Label>
                    <Input inputMode="numeric" placeholder={`0 ~ ${SEED_MAX}`} />
                  </TextField>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <Magnet disabled={busy}>
                  <Button
                    className="min-w-[128px] rounded-pill shadow-2 transition-[transform,box-shadow] duration-200 ease-out-soft hover:-translate-y-px hover:shadow-3 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    fullWidth={false}
                    isDisabled={missingImages || needsImageButModelCant || busy}
                    isPending={busy}
                    variant="primary"
                    onPress={handleSubmit}
                  >
                    <Sparkles className="size-4" />
                    <ShinyText
                      delay={1}
                      disabled={busy}
                      speed={2}
                      text={busyLabel}
                    />
                  </Button>
                </Magnet>
              </div>
            </Card.Content>
          </Card>
        </SpotlightCard>
      </FadeIn>

      <FadeIn className="h-full" delay={0.06}>
        <SpotlightCard className="h-full">
          <Card className="h-full rounded-card border border-border p-6">
            <Card.Header>
              <Card.Title className="text-[15px] font-semibold">
                <BlurText delay={0.08}>生成结果</BlurText>
              </Card.Title>
            </Card.Header>
            <Card.Content>
              <ResultView
                failure={failure}
                loading={loading}
                model={model}
                onRetry={lastRequest && failure?.retryable ? () => void send(lastRequest) : null}
                results={results}
                skillName={skill.name}
              />
            </Card.Content>
          </Card>
        </SpotlightCard>
      </FadeIn>

      <Modal.Backdrop isOpen={bodyOpen} onOpenChange={setBodyOpen}>
        <Modal.Container size="lg">
          <Modal.Dialog className="rounded-card">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>发送正文 · {skill.nameEn}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {skill.stats.parts.map((part) => (
                  <Chip key={part.path} size="sm" variant="tertiary">
                    <span className="tech">{part.path}</span> · {(part.bytes / 1024).toFixed(1)} KB
                  </Chip>
                ))}
                {userNote.trim().length > 0 ? (
                  <Chip size="sm" variant="tertiary">
                    {noSkill ? "你的提示词" : "本次补充"} · {userNote.trim().length} 字符
                  </Chip>
                ) : null}
                {distillOn && distillHit ? (
                  <Chip color="accent" size="sm" variant="soft">
                    蒸馏自 {distillHit.fromChars} 字符原文 · {distillHit.model}
                  </Chip>
                ) : null}
              </div>
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-secondary p-3 text-[12px] leading-relaxed">
                {sendBody}
              </pre>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close">关闭</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
