"use client";

import { Toast, Tooltip, toast } from "@heroui/react";
import { Sparkles } from "@gravity-ui/icons";
import { useCallback, useEffect, useState } from "react";

import { HistoryPanel } from "@/components/history-panel";
import { OpenSettingsContext } from "@/components/settings-context";
import { SettingsModal } from "@/components/settings-modal";
import { StudioPanel } from "@/components/studio-panel";
import { SplitText } from "@/components/reactbits/SplitText";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  addHistoryEntry,
  clearAllHistory,
  loadHistoryList,
  removeHistoryEntry,
  type HistoryInput,
  type HistoryMeta,
} from "@/lib/history";
import { DEFAULT_MODEL_ID } from "@/lib/providers";
import { SKILLS, findSkill } from "@/lib/skills";

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Workspace() {
  const [items, setItems] = useState<HistoryMeta[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState<string | null>(null);
  const [skillId, setSkillId] = useState(SKILLS[0]?.id ?? "");
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);

  const skill = findSkill(skillId) ?? SKILLS[0];

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ providerId?: string }>).detail;
      setSettingsProvider(detail?.providerId ?? null);
      setSettingsOpen(true);
    };
    window.addEventListener("studio:need-key", open);
    return () => window.removeEventListener("studio:need-key", open);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadHistoryList()
      .then((list) => {
        if (!cancelled) {
          setItems(list);
        }
      })
      .catch((error: unknown) => {
        console.error("历史记录读取失败", error);
        toast.danger(`历史记录读取失败：${reasonOf(error)}`);
      });
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

  const openSettings = useCallback((providerId?: string) => {
    setSettingsProvider(providerId ?? null);
    setSettingsOpen(true);
  }, []);

  if (!skill) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center text-sm text-muted">
        没有读到任何内置 Skill。先跑 <span className="tech">npm run build:skills</span> 生成
        lib/skills.generated.ts。
      </div>
    );
  }

  return (
    <OpenSettingsContext.Provider value={openSettings}>
      <div className="flex w-full flex-col gap-4 px-4 pb-10 sm:px-6">
        <header className="sticky top-0 z-40 -mx-4 flex flex-wrap items-center gap-3 border-b border-border bg-glass px-4 pb-3 pt-4 backdrop-blur-md sm:-mx-6 sm:px-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground shadow-2">
            <Sparkles className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-lg font-semibold">
              <SplitText text="Skill 图像工作台" />
            </h1>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <SettingsModal
              isOpen={settingsOpen}
              onOpenChange={(open) => {
                setSettingsOpen(open);
                if (!open) {
                  setSettingsProvider(null);
                }
              }}
              onProviderChange={setSettingsProvider}
              providerId={settingsProvider}
            />
            <Tooltip delay={300}>
              <a
                aria-label="百炼千问图像接口文档"
                className="text-sm text-muted underline-offset-4 hover:underline"
                href="https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference"
                rel="noopener noreferrer"
                target="_blank"
              >
                接口文档
              </a>
              <Tooltip.Content>
                <p>阿里云百炼《千问-图像生成与编辑》API 参考</p>
              </Tooltip.Content>
            </Tooltip>
            <ThemeToggle />
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <StudioPanel
            model={model}
            onHistoryAdd={handleHistoryAdd}
            onModelChange={setModel}
            onSkillChange={setSkillId}
            skill={skill}
          />

          <HistoryPanel items={items} onClear={handleClear} onDelete={handleDelete} />
        </div>
      </div>
      <Toast.Provider placement="top" />
    </OpenSettingsContext.Provider>
  );
}
