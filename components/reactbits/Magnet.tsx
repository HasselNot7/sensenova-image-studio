"use client";

import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { useCallback, useRef } from "react";

interface MagnetProps {
  children: React.ReactNode;
  /** 吸附位移上限（px），默认 4 */
  maxOffset?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * React Bits Magnet（motion 版）：hover 时元素朝光标轻微吸附，
 * 位移上限 4px，移出后 220ms 回弹；mousemove 只写 motion value，不逐帧 setState。
 */
export function Magnet({ children, className = "", disabled = false, maxOffset = 4 }: MagnetProps) {
  const reduced = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springConfig = { duration: 0.22, bounce: 0 };
  const x = useSpring(rawX, springConfig);
  const y = useSpring(rawY, springConfig);

  const active = !disabled && !reduced;

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!active || !wrapperRef.current) {
        return;
      }
      const rect = wrapperRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const clamp = (v: number) => Math.max(-maxOffset, Math.min(maxOffset, v));
      rawX.set(clamp(((event.clientX - centerX) / rect.width) * maxOffset * 2));
      rawY.set(clamp(((event.clientY - centerY) / rect.height) * maxOffset * 2));
    },
    [active, maxOffset, rawX, rawY],
  );

  const handleMouseLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  return (
    <div
      ref={wrapperRef}
      className={`inline-block ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.span className="inline-block will-change-transform" style={{ x, y }}>
        {children}
      </motion.span>
    </div>
  );
}
