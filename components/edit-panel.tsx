"use client";

import {
  Button,
  Card,
  Description,
  FieldError,
  Input,
  Label,
  Radio,
  RadioGroup,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { ArrowDownFromLine, Pencil, TrashBin } from "@gravity-ui/icons";
import { useCallback, useRef, useState } from "react";

import { OptionSwitch, SimpleSelect, SizeField } from "@/components/form-controls";
import { BlurText } from "@/components/reactbits/BlurText";
import { FadeIn } from "@/components/reactbits/FadeIn";
import { Magnet } from "@/components/reactbits/Magnet";
import { ShinyText } from "@/components/reactbits/ShinyText";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { ResultView } from "@/components/result-view";
import { useOpenSettings } from "@/components/settings-context";
import { requestSensenovaImage } from "@/lib/api-client";
import { createHistoryItem, type HistoryInput } from "@/lib/history";
import {
  approxBytesFromDataURL,
  compressImageForUpload,
  formatMB,
  loadImageElement,
  type CompressedImage,
  type SourceImage,
} from "@/lib/image-compress";
import {
  U1_LITE,
  U1_LITE_DEFAULT_SIZE,
  U1_LITE_SIZE_PRESETS,
  isHttpUrl,
  isImageDataURL,
  type EditRequest,
  type ResponseFormat,
} from "@/lib/models";
import { buildEditRequest, validateEditParams } from "@/lib/request-builder";
import type { ApiFailure } from "@/lib/errors";

const SUBMIT_WARN_BYTES = 10 * 1024 * 1024;
const EDGE_PRESETS = [1024, 1536, 2048, 3072];

const RESPONSE_FORMAT_OPTIONS = [
  { value: "b64_json", label: "b64_json", note: "（默认）" },
  { value: "url", label: "url" },
] satisfies { value: ResponseFormat; label: string; note?: string }[];

interface EditPanelProps {
  onHistoryAdd: (item: HistoryInput) => void;
}

export function EditPanel({ onHistoryAdd }: EditPanelProps) {
  const [source, setSource] = useState<"url" | "upload">("url");
  const [urlValue, setUrlValue] = useState("");
  const [origImage, setOrigImage] = useState<SourceImage | null>(null);
  const [compressed, setCompressed] = useState<CompressedImage | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressError, setCompressError] = useState<string | null>(null);
  const [compress, setCompress] = useState(true);
  const [maxEdgeInput, setMaxEdgeInput] = useState("2048");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<string>(U1_LITE_DEFAULT_SIZE);
  const [customSize, setCustomSize] = useState("");
  const [watermark, setWatermark] = useState(true);
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("b64_json");
  const [promptExtend, setPromptExtend] = useState(true);

  const [loading, setLoading] = useState(false);
  const [imageResult, setImageResult] = useState<{ image: string; createdAtMs: number } | null>(
    null,
  );
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [lastRequest, setLastRequest] = useState<EditRequest | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const compressToken = useRef(0);
  const openSettings = useOpenSettings();

  const runCompression = useCallback((sourceImage: SourceImage, target: number) => {
    const token = compressToken.current + 1;
    compressToken.current = token;
    setCompressing(true);
    setCompressError(null);
    void compressImageForUpload(sourceImage, target)
      .then((result) => {
        if (compressToken.current !== token) {
          return;
        }
        setCompressed(result);
        setCompressing(false);
      })
      .catch((error: unknown) => {
        if (compressToken.current !== token) {
          return;
        }
        setCompressed(null);
        setCompressing(false);
        setCompressError(error instanceof Error ? error.message : "压缩失败，请重试或关闭压缩");
      });
  }, []);

  const edgeNumber = /^\d+$/.test(maxEdgeInput.trim()) ? Number(maxEdgeInput.trim()) : NaN;
  const edgeValid = Number.isInteger(edgeNumber) && edgeNumber >= 512;
  const edgeTooBig = edgeValid && edgeNumber > 4096;

  const applyEdge = (next: string) => {
    setMaxEdgeInput(next);
    if (compress && origImage) {
      const target = /^\d+$/.test(next.trim()) ? Number(next.trim()) : NaN;
      if (Number.isInteger(target) && target >= 512) {
        runCompression(origImage, target);
      }
    }
  };

  const handleCompressChange = (next: boolean) => {
    setCompress(next);
    if (!next) {
      compressToken.current += 1;
      setCompressed(null);
      setCompressing(false);
      setCompressError(null);
    } else if (origImage && edgeValid) {
      runCompression(origImage, edgeNumber);
    }
  };

  const effectiveDataUrl =
    compress && compressed ? compressed.dataUrl : (origImage?.dataUrl ?? null);
  const imageUrl = source === "url" ? urlValue.trim() : (effectiveDataUrl ?? "");
  const finalSize = size === "__custom__" ? customSize.trim() : size;

  const urlInvalid =
    source === "url" && urlValue.trim().length > 0 && !isHttpUrl(urlValue);

  const clearImage = () => {
    compressToken.current += 1;
    setOrigImage(null);
    setCompressed(null);
    setCompressing(false);
    setCompressError(null);
    setFileName("");
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelected = async (file: File | null | undefined) => {
    setFileError(null);
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setFileError("请选择图片文件（png / jpeg / webp）");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      setFileError("本地文件读取失败，请重试");
    };
    reader.onload = async () => {
      const result = String(reader.result ?? "");
      if (!isImageDataURL(result)) {
        setFileError("读取失败：未能生成 data:image/*;base64 格式的 Data-URL");
        return;
      }
      try {
        const image = await loadImageElement(result);
        compressToken.current += 1;
        setCompressed(null);
        setCompressError(null);
        setFileName(file.name);
        const sourceImage: SourceImage = {
          dataUrl: result,
          width: image.naturalWidth,
          height: image.naturalHeight,
          bytes: file.size,
          mime: file.type,
        };
        setOrigImage(sourceImage);
        if (compress && edgeValid) {
          runCompression(sourceImage, edgeNumber);
        }
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "图片解析失败");
      }
    };
    reader.readAsDataURL(file);
  };

  const send = useCallback(
    async (request: EditRequest) => {
      setLoading(true);
      setFailure(null);
      setLastRequest(request);
      const response = await requestSensenovaImage("/api/sensenova/edits", request);
      setLoading(false);
      if (response.ok) {
        setImageResult({ image: response.image, createdAtMs: response.created * 1000 });
        toast.success("图片编辑成功", { description: "已保存到历史记录（Data-URL，可长期查看）" });
        onHistoryAdd(
          createHistoryItem({
            mode: "edit",
            model: U1_LITE,
            prompt: request.prompt,
            params: {
              尺寸: request.size,
              水印: request.watermark ? "开" : "关",
              提示词润色: request.prompt_extend ? "开" : "关",
              参考图:
                source === "upload" ? `本地上传（${fileName}）` : request.images[0].image_url,
            },
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
    [fileName, onHistoryAdd, openSettings, source],
  );

  const handleSubmit = () => {
    const issue = validateEditParams({
      imageUrl,
      imageSource: source,
      prompt,
      size,
      customSize,
    });
    if (issue) {
      toast.danger("请先完善输入", { description: issue.message });
      return;
    }
    if (source === "upload") {
      if (compress && !edgeValid) {
        toast.danger("压缩参数不合法", { description: "长边缩放至需为 512 以上的整数" });
        return;
      }
      if (compress && compressing) {
        toast.info("压缩处理中，请稍候…");
        return;
      }
      if (!compress && effectiveDataUrl && approxBytesFromDataURL(effectiveDataUrl) > SUBMIT_WARN_BYTES) {
        toast.warning("未开启压缩，图片较大", {
          description: `Base64 约 ${formatMB(approxBytesFromDataURL(effectiveDataUrl))}，上传与生成可能明显变慢`,
        });
      }
    }
    void send(
      buildEditRequest({
        imageUrl,
        prompt,
        size: finalSize,
        watermark,
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
            <BlurText delay={0}>图片编辑</BlurText>
          </Card.Title>
          <Card.Description className="text-xs leading-relaxed">
            仅 <span className="tech">sensenova-u1.5-lite</span> 模型支持
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-5">
          <RadioGroup
            isDisabled={loading}
            orientation="horizontal"
            value={source}
            onChange={(value) => setSource(value === "upload" ? "upload" : "url")}
          >
            <Radio value="url">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                公网图片 URL
              </Radio.Content>
            </Radio>
            <Radio value="upload">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                本地文件上传
              </Radio.Content>
            </Radio>
          </RadioGroup>

          {source === "url" ? (
            <TextField
              isDisabled={loading}
              isInvalid={urlInvalid}
              value={urlValue}
              onChange={setUrlValue}
            >
              <Label className="text-[13px] font-medium text-foreground/80">参考图链接</Label>
              <Input placeholder="https://example.com/reference.png" />
              {urlInvalid ? (
                <FieldError>必须是 http:// 或 https:// 开头的完整公网链接</FieldError>
              ) : null}
            </TextField>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  type="file"
                  onChange={(event) => void handleFileSelected(event.target.files?.[0])}
                />
                <Button
                  isDisabled={loading}
                  variant="secondary"
                  onPress={() => fileInputRef.current?.click()}
                >
                  <ArrowDownFromLine className="size-4" />
                  选择本地图片
                </Button>
                {origImage ? (
                  <Button isDisabled={loading} size="sm" variant="tertiary" onPress={clearImage}>
                    <TrashBin className="size-4" />
                    移除
                  </Button>
                ) : null}
              </div>
              {fileError ? <p className="text-sm text-danger">{fileError}</p> : null}

              <OptionSwitch
                description="将图片长边等比缩放并重新编码，可显著减小体积"
                isDisabled={loading}
                label="上传前压缩"
                onChange={handleCompressChange}
                selected={compress}
              />

              {compress ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-40">
                      <TextField
                        isDisabled={loading}
                        isInvalid={origImage !== null && !edgeValid}
                        value={maxEdgeInput}
                        onChange={applyEdge}
                      >
                        <Label className="text-[13px] font-medium text-foreground/80">
                          长边缩放至
                        </Label>
                        <Input min={512} step={1} type="number" />
                        {origImage !== null && !edgeValid ? (
                          <FieldError>需为 512 以上的整数</FieldError>
                        ) : null}
                      </TextField>
                    </div>
                    <span className="mt-5 text-sm text-muted">px</span>
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      {EDGE_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          isDisabled={loading}
                          size="sm"
                          variant={maxEdgeInput.trim() === String(preset) ? "primary" : "tertiary"}
                          onPress={() => applyEdge(String(preset))}
                        >
                          {preset}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {edgeTooBig ? (
                    <p className="text-xs leading-relaxed text-muted">
                      输出尺寸最大 4096，超出部分仅减小体积，不会提升清晰度
                    </p>
                  ) : null}
                </div>
              ) : null}

              {compressError ? <p className="text-sm text-danger">{compressError}</p> : null}

              {origImage ? (
                <div className="flex items-center gap-3 rounded-control border border-border bg-surface-secondary p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="参考图预览"
                    className="size-20 rounded-control border border-border bg-surface object-cover"
                    src={effectiveDataUrl ?? origImage.dataUrl}
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{fileName}</span>
                    {compress && compressed ? (
                      <span className="text-xs text-muted">
                        原图 {origImage.width}x{origImage.height} / {formatMB(origImage.bytes)} →
                        压缩后 {compressed.width}x{compressed.height} / {formatMB(compressed.bytes)}
                      </span>
                    ) : compress && compressing ? (
                      <span className="text-xs text-muted">
                        原图 {origImage.width}x{origImage.height} / {formatMB(origImage.bytes)} →
                        压缩中…
                      </span>
                    ) : compress && !edgeValid ? (
                      <span className="text-xs text-muted">
                        原图 {origImage.width}x{origImage.height} / {formatMB(origImage.bytes)}（等待有效压缩参数）
                      </span>
                    ) : (
                      <span className="text-xs text-muted">
                        原图 {origImage.width}x{origImage.height} / {formatMB(origImage.bytes)}
                        {!compress
                          ? ` → 直接上传（Base64 约 ${formatMB(
                              approxBytesFromDataURL(origImage.dataUrl),
                            )}）`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <TextField isDisabled={loading} value={prompt} onChange={setPrompt}>
            <Label className="text-[13px] font-medium text-foreground/80">编辑指令</Label>
            <TextArea
              placeholder="例如：把人物的衣服换成红色羽绒服，保留面部和背景不变"
              rows={4}
            />
            <Description className="text-right text-xs leading-relaxed">当前 {prompt.length} 字符</Description>
          </TextField>

          <SizeField
            allowCustom
            customValue={customSize}
            isDisabled={loading}
            label="尺寸"
            onCustomChange={setCustomSize}
            onChange={setSize}
            options={U1_LITE_SIZE_PRESETS}
            value={size}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <OptionSwitch
              isDisabled={loading}
              label="水印"
              onChange={setWatermark}
              selected={watermark}
            />
            <OptionSwitch
              isDisabled={loading}
              label="提示词润色"
              onChange={setPromptExtend}
              selected={promptExtend}
            />
            <SimpleSelect
              isDisabled={loading}
              label="返回方式"
              onChange={(value) => setResponseFormat(value as ResponseFormat)}
              options={RESPONSE_FORMAT_OPTIONS}
              value={responseFormat}
            />
          </div>

          <div className="flex justify-end">
            <Magnet disabled={loading}>
              <Button className="min-w-[128px] rounded-pill shadow-2 transition-[transform,box-shadow] duration-200 ease-out-soft hover:-translate-y-px hover:shadow-3 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0" isPending={loading} variant="primary" onPress={handleSubmit}>
                <Pencil className="size-4" />
                <ShinyText
                  delay={1}
                  disabled={loading || prompt.trim().length === 0}
                  speed={2}
                  text={loading ? "编辑中…" : "开始编辑"}
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
            <BlurText delay={0.08}>编辑结果</BlurText>
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <ResultView
            emptyHint="提供参考图和编辑指令后点击「开始编辑」，结果将显示在这里并自动写入历史记录"
            failure={failure}
            loading={loading}
            model={U1_LITE}
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
