"use client";

import { useRef } from "react";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  /** 光斑颜色，默认品牌蓝 10% 透明度 */
  spotlightColor?: string;
  /** 光斑半径（px），≤240 */
  radius?: number;
}

/**
 * React Bits SpotlightCard（CSS 变量版）：hover 高光跟随鼠标，
 * 直接写 overlay 的 background，不逐帧 setState；仅卡面微亮，无 3D 倾斜。
 */
export function SpotlightCard({
  children,
  className = "",
  radius = 240,
  spotlightColor = "rgba(17, 119, 228, 0.1)",
}: SpotlightCardProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const overlay = overlayRef.current;
    const host = overlay?.parentElement;
    if (!overlay || !host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    overlay.style.background = `radial-gradient(circle ${radius}px at ${x}px ${y}px, ${spotlightColor}, transparent 100%)`;
  };

  const handleMouseEnter = () => {
    if (overlayRef.current) {
      overlayRef.current.style.opacity = "1";
    }
  };

  const handleMouseLeave = () => {
    if (overlayRef.current) {
      overlayRef.current.style.opacity = "0";
    }
  };

  return (
    <div
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-card opacity-0 transition-opacity duration-200 ease-out-soft motion-reduce:transition-none"
      />
    </div>
  );
}
