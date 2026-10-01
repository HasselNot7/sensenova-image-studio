"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface BlurTextProps {
  children: ReactNode;
  className?: string;
  /** 错峰延迟（秒） */
  delay?: number;
  duration?: number;
}

/**
 * React Bits BlurText（motion 版）：挂载时模糊淡入一次，位移 ≤6px。
 */
export function BlurText({ children, className = "", delay = 0, duration = 0.4 }: BlurTextProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <span className={className}>{children}</span>;
  }

  return (
    <motion.span
      className={`inline-block will-change-[transform,filter,opacity] ${className}`}
      initial={{ opacity: 0, y: 6, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.span>
  );
}
