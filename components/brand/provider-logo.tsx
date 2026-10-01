"use client";

import type { ReactElement } from "react";

import { BailianLogo } from "./bailian-logo";
import { OpenAiLogo } from "./openai-logo";
import { SensenovaLogo } from "./sensenova-logo";
import type { ProviderDescriptor } from "@/lib/providers";

/** 服务商商标：key 对应 descriptor 的 `logo` 字段；没配 logo 时退回短名首字图章。 */
const LOGOS: Record<string, (props: { className?: string }) => ReactElement> = {
  bailian: BailianLogo,
  sensenova: SensenovaLogo,
  openai: OpenAiLogo,
};

export function ProviderLogo({
  className,
  provider,
}: {
  className?: string;
  provider: ProviderDescriptor;
}) {
  const Logo = provider.logo ? LOGOS[provider.logo] : undefined;
  if (Logo) {
    return <Logo className={className} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center rounded-control bg-accent font-semibold text-accent-foreground ${className ?? "size-12 text-[19px]"}`}
    >
      {provider.shortName.slice(0, 1)}
    </span>
  );
}
