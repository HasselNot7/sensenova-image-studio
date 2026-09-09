"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

interface CountUpProps {
  value: number;
  /** 过渡时长（秒），≤0.5 */
  duration?: number;
  className?: string;
}

/**
 * React Bits CountUp（motion 版）：数值变化时滚动过渡，
 * 直接写 textContent，不逐帧 setState。
 */
export function CountUp({ className = "", duration = 0.5, value }: CountUpProps) {
  const reduced = useReducedMotion();
  const spanRef = useRef<HTMLSpanElement>(null);
  const currentRef = useRef(value);
  const firstRef = useRef(true);

  useEffect(() => {
    const node = spanRef.current;
    if (!node) {
      return;
    }
    if (firstRef.current || reduced) {
      firstRef.current = false;
      currentRef.current = value;
      node.textContent = String(value);
      return;
    }
    const from = currentRef.current;
    if (from === value) {
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        currentRef.current = latest;
        if (node) {
          node.textContent = String(Math.round(latest));
        }
      },
      onComplete: () => {
        currentRef.current = value;
        if (node) {
          node.textContent = String(value);
        }
      },
    });
    return () => controls.stop();
  }, [duration, reduced, value]);

  return (
    <span ref={spanRef} className={className}>
      {value}
    </span>
  );
}
