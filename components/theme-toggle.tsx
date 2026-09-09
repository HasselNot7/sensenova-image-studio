"use client";

import { Button, Tooltip } from "@heroui/react";
import { Moon, Sun } from "@gravity-ui/icons";
import { useTheme } from "next-themes";
import { useRef } from "react";
import { flushSync } from "react-dom";

type DocWithVT = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const applyTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const handleToggle = () => {
    const doc = document as DocWithVT;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduced) {
      applyTheme();
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth;
    const y = rect ? rect.top + rect.height / 2 : 0;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const transition = doc.startViewTransition(() => {
      flushSync(applyTheme);
    });
    void transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
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
        <Sun className="hidden size-4 dark:block" />
        <Moon className="size-4 dark:hidden" />
      </Button>
      <Tooltip.Content>
        <p>切换深色 / 浅色主题（默认跟随系统）</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
