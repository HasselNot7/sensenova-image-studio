"use client";

import { createContext, useContext } from "react";

/** 供错误提示等任意位置唤起「设置」弹窗，可选带上要聚焦的服务商小节。 */
export const OpenSettingsContext = createContext<(providerId?: string) => void>(() => {});

export function useOpenSettings(): (providerId?: string) => void {
  return useContext(OpenSettingsContext);
}
