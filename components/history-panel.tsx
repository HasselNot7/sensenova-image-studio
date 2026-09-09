"use client";

import {
  Button,
  Card,
  Chip,
  Modal,
  Tooltip,
  toast,
} from "@heroui/react";
import { ArrowDownToLine, Clock, TrashBin } from "@gravity-ui/icons";
import { useState } from "react";

import { BlurText } from "@/components/reactbits/BlurText";
import { CountUp } from "@/components/reactbits/CountUp";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { buildFilename, extensionForDataUrl, triggerDownload } from "@/lib/download";
import type { HistoryItem } from "@/lib/history";

interface HistoryPanelProps {
  items: HistoryItem[];
  onDelete: (id: string) => void;
  onClear: () => void;
}

export function HistoryPanel({ items, onDelete, onClear }: HistoryPanelProps) {
  const [preview, setPreview] = useState<HistoryItem | null>(null);

  return (
    <SpotlightCard className="h-full">
    <Card className="h-full rounded-card border border-border p-6">
      <Card.Header className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted" />
          <Card.Title className="text-[15px] font-semibold">
            <BlurText delay={0.16}>历史记录</BlurText>
          </Card.Title>
        </div>
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft">
            <CountUp value={items.length} /> 条
          </Chip>
          {items.length > 0 ? (
            <Button
              size="sm"
              variant="danger-soft"
              onPress={() => {
                onClear();
                toast.info("已清空历史记录");
              }}
            >
              清空
            </Button>
          ) : null}
        </div>
      </Card.Header>
      <Card.Content>
        {items.length === 0 ? (
          <p className="py-8 text-center text-xs leading-[1.7] text-muted">
            暂无记录，生成成功后会自动保存在这里
          </p>
        ) : (
          <div className="scrollbar flex max-h-[70vh] flex-col gap-2 overflow-y-auto pe-1 lg:max-h-[calc(100vh-200px)]">
            {items.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-3 rounded-control border border-border bg-surface p-2 transition-colors duration-150 ease-out-soft hover:bg-surface-secondary motion-reduce:transition-none"
              >
                <button
                  className="size-14 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border bg-surface-secondary"
                  title="点击回看"
                  type="button"
                  onClick={() => setPreview(item)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={item.prompt} className="size-full object-cover" src={item.image} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p
                    className="cursor-pointer truncate text-sm"
                    title="点击回看"
                    onClick={() => setPreview(item)}
                  >
                    {item.prompt}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Chip size="sm" variant="tertiary">
                      <span className="tech">{item.model}</span>
                    </Chip>
                    <Chip size="sm" variant="tertiary">
                      {item.mode === "generate" ? "文生图" : "编辑"}
                    </Chip>
                    <span>{new Date(item.ts).toLocaleString("zh-CN")}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col justify-center gap-1 transition-opacity duration-150 ease-out-soft motion-reduce:transition-none">
                  <Tooltip delay={300}>
                    <Button
                      aria-label="下载"
                      isIconOnly
                      size="sm"
                      variant="tertiary"
                      onPress={() =>
                        triggerDownload(
                          item.image,
                          buildFilename(item.model, item.ts, extensionForDataUrl(item.image)),
                        )
                      }
                    >
                      <ArrowDownToLine className="size-4" />
                    </Button>
                    <Tooltip.Content>
                      <p>下载图片</p>
                    </Tooltip.Content>
                  </Tooltip>
                  <div className="opacity-0 transition-opacity duration-150 ease-out-soft group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
                    <Tooltip delay={300}>
                      <Button
                        aria-label="删除"
                        isIconOnly
                        size="sm"
                        variant="danger-soft"
                        onPress={() => onDelete(item.id)}
                      >
                        <TrashBin className="size-4" />
                      </Button>
                      <Tooltip.Content>
                        <p>删除记录</p>
                      </Tooltip.Content>
                    </Tooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card.Content>

      <Modal.Backdrop isOpen={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <Modal.Container size="lg" placement="auto">
          <Modal.Dialog className="rounded-card">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>历史生成结果</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              {preview ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-border bg-default/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={preview.prompt}
                      className="max-h-[60vh] w-full object-contain"
                      src={preview.image}
                    />
                  </div>
                  <div className="flex flex-col gap-1 text-sm">
                    <p>
                      <span className="text-muted">提示词：</span>
                      {preview.prompt}
                    </p>
                    {Object.entries(preview.params).map(([key, value]) => {
                      const text = String(value);
                      const isTech = /^[a-z0-9._x-]+$/.test(text);
                      return (
                        <p key={key}>
                          <span className="text-muted">{key}：</span>
                          {isTech ? <span className="tech">{text}</span> : text}
                        </p>
                      );
                    })}
                    <p>
                      <span className="text-muted">模型：</span>
                      <span className="tech">{preview.model}</span>
                    </p>
                    <p>
                      <span className="text-muted">时间：</span>
                      {new Date(preview.ts).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </>
              ) : null}
            </Modal.Body>
            <Modal.Footer className="justify-between">
              {preview ? (
                <>
                  <Button
                    variant="secondary"
                    onPress={() =>
                      triggerDownload(
                        preview.image,
                        buildFilename(preview.model, preview.ts, extensionForDataUrl(preview.image)),
                      )
                    }
                  >
                    <ArrowDownToLine className="size-4" />
                    下载
                  </Button>
                  <Button
                    variant="danger-soft"
                    onPress={() => {
                      onDelete(preview.id);
                      setPreview(null);
                    }}
                  >
                    <TrashBin className="size-4" />
                    删除
                  </Button>
                </>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Card>
    </SpotlightCard>
  );
}
