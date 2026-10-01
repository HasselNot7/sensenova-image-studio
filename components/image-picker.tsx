"use client";

import { Button, Chip, Label, Slider, Switch } from "@heroui/react";
import { Delete, Picture } from "@gravity-ui/icons";
import { useRef, useState } from "react";

import { formatMB } from "@/lib/image-compress";
import { ImageInputError, prepareImageInput, type PreparedImage } from "@/lib/image-input";
import type { InputImagePolicy } from "@/lib/models";

interface ImagePickerProps {
  images: PreparedImage[];
  maxCount: number;
  isDisabled: boolean;
  policy: InputImagePolicy;
  maxEdge: number;
  uncompressed: boolean;
  onEdgeChange: (edge: number, uncompressed: boolean) => void;
  onChange: (images: PreparedImage[]) => void;
  /** Skill 作者的成品示例，只预览，绝不发给图像模型 */
  bundled?: { src: string; label: string; note?: string }[];
  onBusyChange?: (busy: boolean) => void;
}

export function ImagePicker({
  bundled = [],
  images,
  isDisabled,
  maxCount,
  onChange,
  onBusyChange,
  onEdgeChange,
  policy,
  maxEdge,
  uncompressed,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setBusy(next: boolean): void {
    setLoading(next);
    onBusyChange?.(next);
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }
    setError(null);
    const room = maxCount - images.length;
    if (room <= 0) {
      setError(`该模型这个界面最多收 ${maxCount} 张，先移除一张`);
      return;
    }
    setBusy(true);
    const next: PreparedImage[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        next.push(await prepareImageInput(file, file.name, policy, maxEdge, file));
      } catch (issue) {
        setError(issue instanceof ImageInputError ? issue.message : String(issue));
      }
    }
    if (next.length > 0) {
      onChange([...images, ...next]);
    }
    setBusy(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Button
          isDisabled={isDisabled || loading || images.length >= maxCount}
          size="sm"
          variant="secondary"
          onPress={() => inputRef.current?.click()}
        >
          <Picture />
          选择本地照片
        </Button>
        <input
          accept={policy.formats.join(",")}
          className="hidden"
          multiple
          ref={inputRef}
          type="file"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <Chip size="sm" variant="tertiary">
          {images.length} / {maxCount} 张
        </Chip>
        <span className="pb-1.5 text-[11.5px] text-muted">
          {formatMB(policy.maxBytes)} {policy.hardMaxBytes ? "上限" : "警告线"} ·{" "}
          {policy.formats.map((f) => f.split("/")[1]).join("/")}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Slider
          className="min-w-0 flex-1"
          isDisabled={isDisabled || loading || uncompressed}
          maxValue={policy.maxEdgeCeiling}
          minValue={512}
          step={32}
          value={Math.min(maxEdge, policy.maxEdgeCeiling)}
          onChange={(value: number | number[]) =>
            onEdgeChange(Array.isArray(value) ? value[0] : value, uncompressed)
          }
        >
          <Label className="text-[13px] font-medium text-foreground/80">
            输入图长边{policy.minEdge !== null ? `（官方 ≥${policy.minEdge}）` : ""}
          </Label>
          <Slider.Output>
            {({ state }) => (
              <span className="tech text-[12px] text-muted">{Math.round(state.values[0])} px</span>
            )}
          </Slider.Output>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        {policy.allowUncompressed ? (
          <Switch
            isDisabled={isDisabled || loading}
            isSelected={uncompressed}
            onChange={(next) => onEdgeChange(maxEdge, next)}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              不压缩
            </Switch.Content>
          </Switch>
        ) : null}
      </div>

      {images.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {images.map((image, index) => (
            <div
              className="relative size-24 overflow-hidden rounded-control border border-border bg-surface-secondary"
              key={`${image.name}-${index}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={image.name} className="size-full object-cover" src={image.dataUrl} />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1">
                <span className="truncate text-[10.5px] text-white">
                  {image.width}×{image.height} · {formatMB(image.bytes)}
                  {image.compressed ? " · 已压" : ""}
                </span>
                <button
                  aria-label={`移除第 ${index + 1} 张`}
                  className="cursor-pointer text-white/85 hover:text-white"
                  type="button"
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                >
                  <Delete className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {bundled.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-surface-secondary p-3">
          {bundled.map((asset) => (
            <div className="flex items-center gap-2" key={asset.src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={asset.label}
                className="size-12 rounded-lg border border-border object-cover"
                src={asset.src}
                title={asset.note ?? asset.label}
              />
              <span className="text-[12.5px]">{asset.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-[12.5px] leading-relaxed text-danger">{error}</p> : null}
    </div>
  );
}
