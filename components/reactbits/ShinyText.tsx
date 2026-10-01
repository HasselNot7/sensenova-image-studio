"use client";

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect, useRef } from "react";

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  /** 单次扫过时长（秒） */
  speed?: number;
  /** 两轮之间的停顿（秒），speed+delay 即周期 */
  delay?: number;
  spread?: number;
  className?: string;
}

/**
 * React Bits ShinyText：高光沿文字扫过。
 * 颜色全部引用设计令牌：基色 currentColor（继承按钮前景色），
 * 高光色 var(--color-tint)。
 */
export function ShinyText({
  className = "",
  delay = 1,
  disabled = false,
  spread = 120,
  speed = 2,
  text,
}: ShinyTextProps) {
  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  const animationDuration = speed * 1000;
  const delayDuration = delay * 1000;

  useEffect(() => {
    elapsedRef.current = 0;
    progress.set(0);
  }, [disabled, progress]);

  useAnimationFrame((time) => {
    if (disabled) {
      lastTimeRef.current = null;
      return;
    }
    if (lastTimeRef.current === null) {
      lastTimeRef.current = time;
      return;
    }
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    elapsedRef.current += deltaTime;

    const cycleDuration = animationDuration + delayDuration;
    const cycleTime = elapsedRef.current % cycleDuration;
    progress.set(cycleTime < animationDuration ? (cycleTime / animationDuration) * 100 : 100);
  });

  const backgroundPosition = useTransform(progress, (p) => `${150 - p * 2}% center`);

  return (
    <motion.span
      className={`inline-block ${className}`}
      style={{
        backgroundImage: `linear-gradient(${spread}deg, currentColor 0%, currentColor 35%, var(--color-tint) 50%, currentColor 65%, currentColor 100%)`,
        backgroundSize: "200% auto",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundPosition,
      }}
    >
      {text}
    </motion.span>
  );
}
