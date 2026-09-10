"use client";

import {
  Button,
  Card,
  Description,
  FieldError,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
  toast,
  type Key,
} from "@heroui/react";
import { Sparkles } from "@gravity-ui/icons";
import { useCallback, useState } from "react";

import { OptionSwitch, SimpleSelect, SizeField } from "@/components/form-controls";
import { BlurText } from "@/components/reactbits/BlurText";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { Magnet } from "@/components/reactbits/Magnet";
import { ShinyText } from "@/components/reactbits/ShinyText";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { ResultView } from "@/components/result-view";
import { useOpenSettings } from "@/components/settings-context";
import { requestSensenovaImage } from "@/lib/api-client";
import {
  PROMPT_MAX_CHARS_U1_FAST,
  U1_FAST,
  U1_FAST_DEFAULT_SIZE,
  U1_FAST_SIZES,
  U1_LITE,
  U1_LITE_DEFAULT_SIZE,
  U1_LITE_SIZE_PRESETS,
  type GenerationRequest,
  type ModelId,
  type OutputFormat,
  type ResponseFormat,
} from "@/lib/models";
import { createHistoryItem, type HistoryInput } from "@/lib/history";
import { buildGenerationRequest, validateGenerationParams } from "@/lib/request-builder";
import type { ApiFailure } from "@/lib/errors";

const OUTPUT_FORMAT_OPTIONS = [
  { value: "png", label: "png", note: "（默认）" },
  { value: "jpeg", label: "jpeg" },
  { value: "webp", label: "webp" },
] satisfies { value: OutputFormat; label: string; note?: string }[];

const RESPONSE_FORMAT_OPTIONS = [
  { value: "b64_json", label: "b64_json", note: "（默认）" },
  { value: "url", label: "url" },
] satisfies { value: ResponseFormat; label: string; note?: string }[];

interface GeneratePanelProps {
  onHistoryAdd: (item: HistoryInput) => void;
}

export function GeneratePanel({ onHistoryAdd }: GeneratePanelProps) {
  const [model, setModel] = useState<ModelId>(U1_LITE);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<string>(U1_LITE_DEFAULT_SIZE);
  const [customSize, setCustomSize] = useState("");
  const [watermark, setWatermark] = useState(true);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("b64_json");
  const [promptExtend, setPromptExtend] = useState(true);

  const [loading, setLoading] = useState(false);
  const [imageResult, setImageResult] = useState<{ image: string; createdAtMs: number } | null>(
    null,
  );
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [lastRequest, setLastRequest] = useState<GenerationRequest | null>(null);

  const isFast = model === U1_FAST;
  const openSettings = useOpenSettings();
  const promptTooLong = isFast && prompt.length > PROMPT_MAX_CHARS_U1_FAST;
  const finalSize = !isFast && size === "__custom__" ? customSize.trim() : size;

  const handleModelChange = (next: ModelId) => {
    setModel(next);
    setSize(next === U1_FAST ? U1_FAST_DEFAULT_SIZE : U1_LITE_DEFAULT_SIZE);
    if (next === U1_FAST) {
      setCustomSize("");
    }
  };

  const send = useCallback(
    async (request: GenerationRequest) => {
      setLoading(true);
      setFailure(null);
      setLastRequest(request);
      const response = await requestSensenovaImage("/api/sensenova/generations", request);
      setLoading(false);
      if (response.ok) {
        setImageResult({ image: response.image, createdAtMs: response.created * 1000 });
        toast.success("图片生成成功", { description: "已保存到历史记录（Data-URL，可长期查看）" });
        const params: HistoryInput["params"] = {
          尺寸: request.size,
          水印: request.watermark ? "开" : "关",
        };
        if (request.model === U1_LITE) {
          params["输出格式"] = request.output_format ?? "png";
          params["提示词润色"] = request.prompt_extend ? "开" : "关";
        }
        onHistoryAdd(
          createHistoryItem({
            mode: "generate",
            model: request.model,
            prompt: request.prompt,
            params,
            image: response.image,
          }),
        );
      } else {
        setImageResult(null);
        setFailure(response.failure);
        const isConfigError =
          response.failure.type === "config_error" || response.failure.type === "server_config_error";
        toast.danger(response.failure.hint, {
          description: response.failure.message,
          ...(isConfigError
            ? {
                timeout: 0,
                actionProps: {
                  children: "打开设置",
                  onPress: () => openSettings(),
                  variant: "tertiary" as const,
                },
              }
            : {}),
        });
      }
    },
    [onHistoryAdd, openSettings],
  );

  const handleSubmit = () => {
    const issue = validateGenerationParams({ model, prompt, size, customSize });
    if (issue) {
      toast.danger("请先修正参数", { description: issue.message });
      return;
    }
    void send(
      buildGenerationRequest({
        model,
        prompt,
        size: finalSize,
        watermark,
        outputFormat,
        responseFormat,
        promptExtend,
      }),
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <FadeIn className="h-full">
        <SpotlightCard className="h-full">
      <Card className="h-full rounded-card border border-border p-6">
        <Card.Header>
          <Card.Title className="text-[15px] font-semibold">
            <BlurText delay={0}>文生图参数</BlurText>
          </Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5">
          <Select
            value={model}
            onChange={(key: Key | null) => {
              if (key === U1_FAST || key === U1_LITE) {
                handleModelChange(key);
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
                <ListBox.Item id={U1_FAST} textValue="sensenova-u1-fast">
                  <span className="tech text-[13.5px]">sensenova-u1-fast</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id={U1_LITE} textValue="sensenova-u1.5-lite">
                  <span className="tech text-[13.5px]">sensenova-u1.5-lite</span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>

          <TextField
            isDisabled={loading}
            isInvalid={promptTooLong}
            value={prompt}
            onChange={setPrompt}
          >
            <Label className="text-[13px] font-medium text-foreground/80">提示词</Label>
            <TextArea
              placeholder="例如：一只戴着宇航员头盔的橘猫，漂浮在星云之中，电影感光影"
              rows={5}
            />
            {promptTooLong ? (
              <FieldError>
                已达 {prompt.length} 字符，超过 sensenova-u1-fast 的 4096 token 上限风险，请精简描述
              </FieldError>
            ) : (
              <Description className="text-right text-xs leading-relaxed">
                当前 {prompt.length}
                {isFast ? ` / ${PROMPT_MAX_CHARS_U1_FAST} 字符` : " 字符"}
              </Description>
            )}
          </TextField>

          <SizeField
            allowCustom={!isFast}
            customValue={customSize}
            isDisabled={loading}
            label="尺寸"
            onCustomChange={setCustomSize}
            onChange={setSize}
            options={isFast ? U1_FAST_SIZES : U1_LITE_SIZE_PRESETS}
            value={size}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OptionSwitch
              isDisabled={loading}
              label="水印"
              onChange={setWatermark}
              selected={watermark}
            />
            {!isFast ? (
              <OptionSwitch
                isDisabled={loading}
                label="提示词润色"
                onChange={setPromptExtend}
                selected={promptExtend}
              />
            ) : null}
            {!isFast ? (
              <SimpleSelect
                isDisabled={loading}
                label="图片格式"
                onChange={(value) => setOutputFormat(value as OutputFormat)}
                options={OUTPUT_FORMAT_OPTIONS}
                value={outputFormat}
              />
            ) : null}
            {!isFast ? (
              <SimpleSelect
                isDisabled={loading}
                label="返回方式"
                onChange={(value) => setResponseFormat(value as ResponseFormat)}
                options={RESPONSE_FORMAT_OPTIONS}
                value={responseFormat}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Magnet disabled={loading}>
              <Button
                className="min-w-[128px] rounded-pill shadow-2 transition-[transform,box-shadow] duration-200 ease-out-soft hover:-translate-y-px hover:shadow-3 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                fullWidth={false}
                isDisabled={promptTooLong}
                isPending={loading}
                variant="primary"
                onPress={handleSubmit}
              >
                <Sparkles className="size-4" />
                <ShinyText
                  delay={1}
                  disabled={loading || prompt.trim().length === 0 || promptTooLong}
                  speed={2}
                  text={loading ? "生成中…" : "开始生成"}
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
            emptyHint="填写提示词后点击「开始生成」，结果将显示在这里并自动写入历史记录"
            failure={failure}
            loading={loading}
            model={model}
            onRetry={lastRequest && failure?.retryable ? () => void send(lastRequest) : null}
            result={imageResult}
          />
        </Card.Content>
      </Card>
        </SpotlightCard>
      </FadeIn>
    </div>
  );
}
