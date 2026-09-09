"use client";

import { motion, useReducedMotion } from "motion/react";

interface SplitTextProps {
  text: string;
  className?: string;
  /** 每字间隔（秒），总时长 ≈ stagger*字数 + duration，需 ≤0.6s */
  stagger?: number;
  duration?: number;
}

/**
 * React Bits SplitText（motion 版）：逐字上浮，仅挂载时播放一次。
 * 位移 6px，符合全局动效规范。
 */
export function SplitText({ text, className = "", stagger = 0.02, duration = 0.25 }: SplitTextProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <span className={className}>{text}</span>;
  }

  const chars = Array.from(text);
  return (
    <span className={`inline-block ${className}`}>
      {chars.map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          aria-hidden
          className="inline-block will-change-transform"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, delay: index * stagger, ease: [0.22, 1, 0.36, 1] }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
      <span className="sr-only">{text}</span>
    </span>
  );
}
