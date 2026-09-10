"use client";

import { createContext, useContext } from "react";

/** 供错误提示等任意位置唤起「设置」弹窗。 */
export const OpenSettingsContext = createContext<() => void>(() => {});

export function useOpenSettings(): () => void {
  return useContext(OpenSettingsContext);
}
