"use client";

import { Tabs, Toast, Tooltip, toast } from "@heroui/react";
import { Pencil, Sparkles } from "@gravity-ui/icons";
import { useCallback, useEffect, useState } from "react";

import { SplitText } from "@/components/reactbits/SplitText";
import { EditPanel } from "@/components/edit-panel";
import { GeneratePanel } from "@/components/generate-panel";
import { HistoryPanel } from "@/components/history-panel";
import { SettingsModal } from "@/components/settings-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  addHistoryEntry,
  clearAllHistory,
  loadHistoryList,
  migrateLegacyHistory,
  removeHistoryEntry,
  type HistoryInput,
  type HistoryMeta,
} from "@/lib/history";

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Workspace() {
  const [items, setItems] = useState<HistoryMeta[]>([]);
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

  // 启动：一次性迁移旧 localStorage → IndexedDB，再加载列表（仅元数据+缩略图）。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const migration = await migrateLegacyHistory();
      if (cancelled) {
        return;
      }
      if (migration.error) {
        toast.warning("历史记录迁移未完成", { description: migration.error });
      } else if (migration.migrated > 0) {
        toast.success(`已迁移 ${migration.migrated} 条历史记录`, {
          description: "旧数据已升级为 IndexedDB 存储，重启后仍可显示",
        });
      }
      try {
        const list = await loadHistoryList();
        if (!cancelled) {
          setItems(list);
        }
      } catch (error) {
        console.error("历史记录读取失败", error);
        toast.danger(`历史记录读取失败：${reasonOf(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleHistoryAdd = useCallback(async (item: HistoryInput) => {
    try {
      const next = await addHistoryEntry(item);
      setItems(next);
    } catch (error) {
      console.error("历史记录保存失败", error);
      toast.danger(`历史记录保存失败：${reasonOf(error)}`);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const next = await removeHistoryEntry(id);
      setItems(next);
    } catch (error) {
      console.error("历史记录删除失败", error);
      toast.danger(`历史记录删除失败：${reasonOf(error)}`);
    }
  }, []);

  const handleClear = useCallback(async () => {
    try {
      await clearAllHistory();
      setItems([]);
    } catch (error) {
      console.error("历史记录清空失败", error);
      toast.danger(`历史记录清空失败：${reasonOf(error)}`);
    }
  }, []);

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
