"use client";

import { Alert, Button, Chip, Skeleton, Spinner } from "@heroui/react";
import { ArrowDownToLine, Picture } from "@gravity-ui/icons";
import type { ApiFailure } from "@/lib/errors";
import { buildFilename, extensionForDataUrl, triggerDownload } from "@/lib/download";

interface ResultViewProps {
  loading: boolean;
  results: { image: string; createdAtMs: number }[];
  model: string;
  skillName: string;
  failure: ApiFailure | null;
  onRetry: (() => void) | null;
}

export function ResultView({
  failure,
  loading,
  model,
  onRetry,
  results,
  skillName,
}: ResultViewProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="aspect-square w-full rounded-control sm:aspect-[4/3]" />
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          生成中…
        </div>
      </div>
    );
  }

  if (failure) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>生成失败（{failure.type} · code {failure.code}）</Alert.Title>
          <Alert.Description>
            <p>{failure.hint}</p>
            <p className="mt-1 break-all text-xs opacity-80">上游错误信息：{failure.message}</p>
          </Alert.Description>
        </Alert.Content>
        {failure.retryable && onRetry ? (
          <Button size="sm" variant="danger" onPress={onRetry}>
            重试
          </Button>
        ) : null}
      </Alert>
    );
  }

  if (results.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className={`grid gap-3 ${results.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {results.map((result, index) => (
            <div className="flex flex-col gap-2" key={`${result.image.slice(-24)}-${index}`}>
              <div className="overflow-hidden rounded-control border border-border bg-surface shadow-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`生成结果 ${index + 1}`}
                  className="max-h-[70vh] w-full animate-image-in object-contain motion-reduce:animate-none"
                  src={result.image}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {results.length > 1 ? (
                  <Chip size="sm" variant="tertiary">
                    第 {index + 1} / {results.length} 张
                  </Chip>
                ) : null}
                <Button
                  className="ms-auto"
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    triggerDownload(
                      result.image,
                      buildFilename(
                        `${model}-第${index + 1}张`,
                        result.createdAtMs,
                        extensionForDataUrl(result.image),
                      ),
                    )
                  }
                >
                  <ArrowDownToLine />
                  下载
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft">
            <span className="tech">{model}</span>
          </Chip>
          <Chip size="sm" variant="soft">
            {skillName}
          </Chip>
          <Chip size="sm" variant="soft">
            {new Date(results[0].createdAtMs).toLocaleString("zh-CN")}
          </Chip>
        </div>
      </div>
    );
  }

  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface-secondary text-muted sm:aspect-[4/3]">
      <div className="flex size-16 items-center justify-center rounded-full bg-tint">
        <Picture className="size-7 text-brand" />
      </div>
    </div>
  );
}
