"use client";

import { Tabs, Toast, Tooltip } from "@heroui/react";
import { Pencil, Sparkles } from "@gravity-ui/icons";
import { useCallback, useEffect, useState } from "react";

import { SplitText } from "@/components/reactbits/SplitText";
import { EditPanel } from "@/components/edit-panel";
import { GeneratePanel } from "@/components/generate-panel";
import { HistoryPanel } from "@/components/history-panel";
import { SettingsModal } from "@/components/settings-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { loadHistory, saveHistory, type HistoryItem } from "@/lib/history";

export function Workspace() {
  const [items, setItems] = useState<HistoryItem[]>(() => loadHistory());
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; source: "session" | "env" | null } | null>(
    null,
  );

  const refreshKeyStatus = useCallback(() => {
    fetch("/api/sensenova/status")
      .then((res) => res.json())
      .then((data: { configured?: boolean; source?: "session" | "env" | null }) => {
        setKeyStatus({
          configured: Boolean(data?.configured),
          source: data?.configured ? (data.source ?? "env") : null,
        });
      })
      .catch(() => {
        setKeyStatus(null);
      });
  }, []);

  useEffect(() => {
    refreshKeyStatus();
  }, [refreshKeyStatus]);

  const persist = useCallback((next: HistoryItem[]) => {
    const complete = saveHistory(next);
    return complete;
  }, []);

  const handleHistoryAdd = useCallback(
    (item: HistoryItem) => {
      setItems((prev) => {
        const next = [item, ...prev];
        const complete = persist(next);
        if (!complete) {
          const trimmed = next.slice(0, Math.max(0, next.length - 3));
          persist(trimmed);
          return trimmed;
        }
        return next;
      });
    },
    [persist],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const handleClear = useCallback(() => {
    persist([]);
    setItems([]);
  }, [persist]);

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 pb-10 sm:px-6">
        <header className="sticky top-0 z-40 -mx-4 flex flex-wrap items-center gap-3 border-b border-border bg-glass px-4 pb-3 pt-4 backdrop-blur-md sm:-mx-6 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground shadow-2">
            <Sparkles className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-lg font-semibold">
              <SplitText text="SenseNova 图像创作工作台" />
            </h1>
            <p className="truncate text-xs text-muted">文生图 · 图片编辑</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <SettingsModal
              configured={keyStatus?.configured ?? null}
              onRecheck={refreshKeyStatus}
              source={keyStatus?.source ?? null}
            />
            <Tooltip delay={300}>
              <a
                aria-label="SenseNova 开放平台"
                className="text-sm text-muted underline-offset-4 hover:underline"
                href="https://platform.sensenova.cn/docs"
                rel="noopener noreferrer"
                target="_blank"
              >
                接口文档
              </a>
              <Tooltip.Content>
                <p>platform.sensenova.cn 官方文档</p>
              </Tooltip.Content>
            </Tooltip>
            <ThemeToggle />
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Tabs className="w-full min-w-0">
            <Tabs.ListContainer className="border border-border">
              <Tabs.List aria-label="创作模式">
                <Tabs.Tab id="generate">
                  <Sparkles className="me-1.5 size-4" />
                  文生图
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="edit">
                  <Pencil className="me-1.5 size-4" />
                  图片编辑
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel className="pt-4" id="generate">
              <GeneratePanel onHistoryAdd={handleHistoryAdd} />
            </Tabs.Panel>
            <Tabs.Panel className="pt-4" id="edit">
              <EditPanel onHistoryAdd={handleHistoryAdd} />
            </Tabs.Panel>
          </Tabs>

          <HistoryPanel items={items} onClear={handleClear} onDelete={handleDelete} />
        </div>
      </div>
      <Toast.Provider placement="top" />
    </>
  );
}
