"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  className?: string;
  /** 错峰延迟（秒） */
  delay?: number;
  duration?: number;
}

/**
 * 挂载（含 Tab 切换重新挂载）时卡片整体上滑淡入，位移 6px。
 */
export function FadeIn({ children, className = "", delay = 0, duration = 0.35 }: FadeInProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
