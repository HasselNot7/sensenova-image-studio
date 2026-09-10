"use client";

import { Button, Tooltip } from "@heroui/react";
import { Moon, Sun } from "@gravity-ui/icons";
import { useTheme } from "next-themes";
import { useRef } from "react";

type DocWithVT = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    const root = document.documentElement;
    const next = resolvedTheme === "dark" ? "light" : "dark";

    // 同步应用主题类：next-themes 在 passive effect 里才改 class，
    // 若只调 setTheme，View Transition 会在其之前抓取“新快照”，导致 old==new 无变化。
    const applyNow = () => {
      root.classList.remove("light", "dark");
      root.classList.add(next);
      root.style.colorScheme = next;
      setTheme(next); // 同步 React 状态 + localStorage（passive effect 稍后再设为同值，无视觉变化）
    };

    // 命中 prefers-reduced-motion: reduce → 跳过全部动效，保持硬切
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyNow();
      return;
    }

    const doc = document as DocWithVT;
    // 无 View Transitions → 回退到全局颜色过渡（此路径不叠加 VT，避免双重动画）
    if (!doc.startViewTransition) {
      root.classList.add("theme-transitioning");
      applyNow();
      window.setTimeout(() => root.classList.remove("theme-transitioning"), 250);
      return;
    }

    // VT 路径：仅做圆形扩散揭示，不挂 .theme-transitioning（否则整棵 DOM 同时起 * 过渡会掉帧），也不强制回流。
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth;
    const y = rect ? rect.top + rect.height / 2 : 0;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = doc.startViewTransition(applyNow);
    void transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 350,
            easing: "ease-out",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // 动画失败不影响主题已切换
      });
  };

  return (
    <Tooltip delay={300}>
      <Button
        ref={buttonRef}
        aria-label="切换深浅主题"
        className="size-8 rounded-pill hover:bg-default"
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={handleToggle}
      >
        <span className="relative block size-4">
          <Sun className="theme-icon theme-icon--sun size-4" />
          <Moon className="theme-icon theme-icon--moon size-4" />
        </span>
      </Button>
      <Tooltip.Content>
        <p>切换深色 / 浅色主题（默认跟随系统）</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
