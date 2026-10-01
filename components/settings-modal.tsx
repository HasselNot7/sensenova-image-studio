"use client";

import {
  Alert,
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
  Tooltip,
  toast,
  type Key,
} from "@heroui/react";
import { ArrowUpRightFromSquare, ChevronLeft, Gear } from "@gravity-ui/icons";
import { useEffect, useState, useSyncExternalStore } from "react";

import { DistillMark } from "@/components/brand/distill-mark";
import { ProviderLogo } from "@/components/brand/provider-logo";

import { verifyProviderKey } from "@/lib/api-client";
import {
  clearDistillApiKey,
  clearProviderApiKey,
  distillUsable,
  getBrowserConfigServerSnapshot,
  getDistillConfig,
  isValidApiKey,
  maskApiKey,
  readAllProviders,
  setDistillConfig,
  setProviderCredentials,
  subscribeBrowserConfig,
  type DistillConfig,
  type ProviderReadout,
} from "@/lib/browser-config";
import { parseUpstreamError } from "@/lib/errors";
import type { ProviderDescriptor } from "@/lib/providers";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = 服务商列表；否则直接进入该服务商的表单 */
  providerId: string | null;
  onProviderChange: (providerId: string | null) => void;
}

interface ServerProviderStatus {
  id: string;
  configured: boolean;
  endpointResolvable: boolean;
}

interface Draft {
  apiKey: string;
  values: Record<string, string>;
}

function useBrowserSummary() {
  const raw = useSyncExternalStore(
    subscribeBrowserConfig,
    () =>
      JSON.stringify(
        [
          ...readAllProviders().map((item) => ({
            id: item.provider.id,
            hasKey: item.apiKey.length > 0,
            usable: item.usable,
            endpointError: item.endpointError,
          })),
          {
            id: "distill",
            hasKey: getDistillConfig().apiKey.length > 0,
            usable: distillUsable(),
            endpointError: null,
          },
        ],
      ),
    getBrowserConfigServerSnapshot,
  );
  if (raw.length === 0) {
    return [];
  }
  try {
    return JSON.parse(raw) as {
      id: string;
      hasKey: boolean;
      usable: boolean;
      endpointError: string | null;
    }[];
  } catch {
    return [];
  }
}

function draftFrom(readout: ProviderReadout): Draft {
  return { apiKey: readout.apiKey, values: { ...readout.values } };
}

export function SettingsModal({
  isOpen,
  onOpenChange,
  onProviderChange,
  providerId,
}: SettingsModalProps) {
  const summary = useBrowserSummary();
  const readouts = readAllProviders();
  // 只存「本次还没保存的编辑」；没编辑过的小节直接读浏览器存储。
  const [overrides, setOverrides] = useState<Record<string, Draft>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerProviderStatus[] | null>(null);
  const [distillDraft, setDistillDraft] = useState<DistillConfig | null>(null);
  const distill: DistillConfig = distillDraft ?? getDistillConfig();
  const isDistillView = providerId === "distill";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/status")
      .then((response) => response.json())
      .then((data: { providers?: ServerProviderStatus[] }) => {
        if (cancelled) {
          return;
        }
        setServerStatus(Array.isArray(data?.providers) ? data.providers : []);
      })
      .catch(() => {
        if (!cancelled) {
          setServerStatus([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const detail = providerId
    ? readouts.find((item) => item.provider.id === providerId) ?? null
    : null;

  const anyMissing = summary.some((item) => !item.usable);

  const patch = (providerId: string, base: Draft, next: Partial<Draft>) => {
    setOverrides((current) => ({
      ...current,
      [providerId]: {
        apiKey: next.apiKey ?? base.apiKey,
        values: next.values ?? base.values,
      },
    }));
  };

  /** 保存后丢掉本地编辑，小节直接回读浏览器存储，避免两处真相。 */
  const dropOverride = (providerId: string) => {
    setOverrides((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });
  };

  const save = (provider: ProviderDescriptor, draft: Draft) => {
    const key = draft.apiKey.trim();
    if (key.length > 0 && !isValidApiKey(key)) {
      toast.danger("密钥格式不正确", { description: provider.keyHint });
      return;
    }
    setProviderCredentials(provider, { apiKey: key, values: draft.values });
    if (key.length > 0) {
      setReveal((current) => ({ ...current, [provider.id]: false }));
    }
    dropOverride(provider.id);
    const saved = readAllProviders().find((item) => item.provider.id === provider.id);
    toast.success(`${provider.shortName} 配置已保存到本浏览器`, {
      description: saved?.baseUrl ?? saved?.endpointError ?? "仅存于 localStorage",
    });
  };

  const test = async (provider: ProviderDescriptor, draft: Draft) => {
    if (!provider.verifyPath) {
      toast.info(`${provider.shortName} 暂不支持免出图探测`, {
        description: "直接生成一张试试即可验证密钥是否可用",
      });
      return;
    }
    setProviderCredentials(provider, { apiKey: draft.apiKey, values: draft.values });
    const readout = readAllProviders().find((item) => item.provider.id === provider.id);
    if (!readout?.baseUrl) {
      toast.warning("还不能测试", { description: readout?.endpointError ?? "地址拼不出来" });
      return;
    }
    setTesting(provider.id);
    try {
      const { status, payload } = await verifyProviderKey(provider.id, draft.apiKey);
      const data = (payload ?? {}) as {
        ok?: boolean;
        code?: string;
        message?: string;
        httpStatus?: number;
      };
      if (data.ok) {
        toast.success("鉴权看起来通过", {
          description: `上游回 ${data.code ?? status}；这条探测不出图、不产生费用`,
        });
      } else {
        const failure = parseUpstreamError(data, data.httpStatus ?? status);
        toast.danger(failure.hint, { description: failure.message });
      }
    } catch (error) {
      toast.danger("测试失败", { description: error instanceof Error ? error.message : "网络异常" });
    } finally {
      setTesting(null);
    }
  };

  const saveDistill = () => {
    const next: DistillConfig = {
      baseUrl: distill.baseUrl.trim(),
      model: distill.model.trim(),
      apiKey: distill.apiKey.trim(),
      targetTokens: distill.targetTokens.trim(),
    };
    if (next.baseUrl.length > 0 && !/^https?:\/\/\S+$/i.test(next.baseUrl)) {
      toast.danger("base URL 不对", { description: "要写完整的 http(s) 地址，例如 https://…/compatible-mode/v1" });
      return;
    }
    if (next.apiKey.length > 0 && !isValidApiKey(next.apiKey)) {
      toast.danger("密钥格式不正确", { description: "应为 sk- 开头、不少于 9 个字符" });
      return;
    }
    if (next.targetTokens.trim().length > 0) {
      const target = Number(next.targetTokens.trim());
      if (!Number.isFinite(target) || target < 128) {
        toast.danger("目标 token 太小", {
          description: "至少 128，蒸馏结果才装得下画面要点；想按出图模型上限的 90% 就留空",
        });
        return;
      }
    }
    setDistillConfig(next);
    if (next.apiKey.length > 0) {
      setDistillDraft({ ...next, apiKey: "" });
    } else {
      setDistillDraft(null);
    }
    toast.success("蒸馏模型配置已保存到本浏览器", {
      description: next.baseUrl && next.model.length > 0 ? `${next.baseUrl} · ${next.model}` : "还没填 base URL 或模型名",
    });
  };

  const clear = (provider: ProviderDescriptor) => {
    clearProviderApiKey(provider);
    dropOverride(provider.id);
    toast.info(`已清除 ${provider.shortName} 的浏览器密钥`);
  };

  return (
    <>
      <Tooltip delay={300}>
        <button
          aria-label="打开设置"
          className="relative flex size-9 cursor-pointer items-center justify-center rounded-control border border-border bg-surface text-secondary transition-colors duration-150 ease-out-soft hover:bg-surface-secondary motion-reduce:transition-none"
          type="button"
          onClick={() => onOpenChange(true)}
        >
          <Gear className="size-4" />
          {anyMissing ? (
            <span className="absolute end-1 top-1 size-2 rounded-full bg-warning" />
          ) : null}
        </button>
        <Tooltip.Content>
          <p>
            {anyMissing
              ? "设置 · 服务商密钥（有服务商未配置）"
              : "设置 · 服务商密钥（都已配置）"}
          </p>
        </Tooltip.Content>
      </Tooltip>

      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container size="lg">
          <Modal.Dialog className="rounded-card">
            <Modal.CloseTrigger />
            <Modal.Header className="flex-row items-center gap-2">
              {providerId ? (
                <Button
                  aria-label="返回服务商列表"
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onPress={() => onProviderChange(null)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
              ) : null}
              <Modal.Heading>
                {isDistillView ? "蒸馏模型" : detail ? detail.provider.name : "设置 · 服务商"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-5">
              {isDistillView ? (
                <section className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip
                      color={distillUsable(distill) ? "success" : "warning"}
                      size="sm"
                      variant="soft"
                    >
                      {distillUsable(distill)
                        ? `已配置 ${distill.model}`
                        : distill.baseUrl.length === 0
                          ? "未配置"
                          : "缺模型名或密钥"}
                    </Chip>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <TextField
                      value={distill.baseUrl}
                      onChange={(value) => setDistillDraft({ ...distill, baseUrl: value })}
                    >
                      <Label className="text-[13px] font-medium text-foreground/80">Base URL</Label>
                      <Input placeholder="https://…/compatible-mode/v1（代理拼 /chat/completions）" />
                    </TextField>
                    <TextField
                      value={distill.model}
                      onChange={(value) => setDistillDraft({ ...distill, model: value })}
                    >
                      <Label className="text-[13px] font-medium text-foreground/80">模型名</Label>
                      <Input placeholder="你手上那个 chat 模型的 ID" />
                    </TextField>
                    <TextField
                      value={distill.apiKey}
                      onChange={(value) => setDistillDraft({ ...distill, apiKey: value })}
                    >
                      <Label className="text-[13px] font-medium text-foreground/80">API 密钥</Label>
                      <Input
                        placeholder={
                          distill.apiKey.length > 0 || getDistillConfig().apiKey.length > 0
                            ? `已保存 ${maskApiKey(getDistillConfig().apiKey)}，留空则不改`
                            : "sk-……"
                        }
                        type="password"
                      />
                    </TextField>
                    <TextField
                      value={distill.targetTokens}
                      onChange={(value) => setDistillDraft({ ...distill, targetTokens: value })}
                    >
                      <Label className="text-[13px] font-medium text-foreground/80">目标 token</Label>
                      <Input inputMode="numeric" placeholder="例如 3600，留空 = 出图模型上限的 90%" />
                    </TextField>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="primary" onPress={saveDistill}>
                      保存到浏览器
                    </Button>
                    {getDistillConfig().apiKey.length > 0 ? (
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onPress={() => {
                          clearDistillApiKey();
                          setDistillDraft(null);
                          toast.info("已清除蒸馏模型密钥");
                        }}
                      >
                        清除密钥
                      </Button>
                    ) : null}
                  </div>
                </section>
              ) : null}
              {detail || isDistillView ? null : (
                <div className="flex flex-col gap-3">
                  {readouts.map(({ provider, usable, apiKey, missingFields }) => {
                    const server = serverStatus?.find((item) => item.id === provider.id);
                    const state =
                      usable || server?.configured
                        ? {
                            color: "success" as const,
                            text: `已配置${apiKey.length > 0 ? ` ${maskApiKey(apiKey)}` : "（服务器）"}`,
                          }
                        : apiKey.length === 0
                          ? ({ color: "danger" as const, text: "未配置" } as const)
                          : missingFields.length > 0
                            ? ({ color: "warning" as const, text: "缺必填项" } as const)
                            : ({ color: "danger" as const, text: "地址拼不出" } as const);
                    return (
                      <button
                        className="flex w-full cursor-pointer items-center gap-4 rounded-card border border-border bg-surface px-5 py-4 transition-[border-color,box-shadow] duration-200 ease-out-soft hover:border-accent hover:shadow-2 motion-reduce:transition-none"
                        key={provider.id}
                        type="button"
                        onClick={() => onProviderChange(provider.id)}
                      >
                        <ProviderLogo
                          className={
                            provider.logo
                              ? "h-7 w-auto shrink-0 text-foreground"
                              : "size-11 shrink-0 text-[17px]"
                          }
                          provider={provider}
                        />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          {provider.logo && !provider.logoIsMark ? null : (
                            <span className="text-[13.5px]">{provider.shortName}</span>
                          )}
                          <span className="text-[11.5px] text-muted">
                            {provider.models.length} 个模型
                          </span>
                        </div>
                        <Chip className="ms-auto" color={state.color} size="sm" variant="soft">
                          {state.text}
                        </Chip>
                      </button>
                    );
                  })}
                  <button
                    className="flex w-full cursor-pointer items-center gap-4 rounded-card border border-border bg-surface px-5 py-4 transition-[border-color,box-shadow] duration-200 ease-out-soft hover:border-accent hover:shadow-2 motion-reduce:transition-none"
                    type="button"
                    onClick={() => onProviderChange("distill")}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                      <DistillMark className="size-[22px]" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13.5px]">蒸馏模型</span>
                    </div>
                    <Chip
                      className="ms-auto"
                      color={summary.find((item) => item.id === "distill")?.usable ? "success" : "default"}
                      size="sm"
                      variant="soft"
                    >
                      {summary.find((item) => item.id === "distill")?.usable ? "已配置" : "可选"}
                    </Chip>
                  </button>
                </div>
              )}
              {readouts
                .filter((readout) => detail !== null && readout.provider.id === detail.provider.id)
                .map((readout) => {
                const { provider } = readout;
                const draft = overrides[provider.id] ?? draftFrom(readout);
                const server = serverStatus?.find((item) => item.id === provider.id);
                const savedKey = readout.apiKey;
                return (
                  <section className="flex flex-col gap-4" key={provider.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip
                        color={readout.usable ? "success" : server?.configured ? "success" : "warning"}
                        size="sm"
                        variant="soft"
                      >
                        {readout.usable
                          ? `密钥已配置 ${maskApiKey(savedKey)}`
                          : server?.configured
                            ? "用服务器密钥"
                            : savedKey.length > 0
                              ? "还缺地址参数"
                              : "未配置密钥"}
                      </Chip>
                      <a
                        className="ms-auto inline-flex items-center gap-1 text-[12.5px] text-muted underline-offset-4 hover:underline"
                        href={provider.docsUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {provider.docsLabel}
                        <ArrowUpRightFromSquare className="size-3" />
                      </a>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <TextField
                        value={draft.apiKey}
                        onChange={(value) => patch(provider.id, draft, { apiKey: value })}
                      >
                        <Label className="text-[13px] font-medium text-foreground/80">
                          {provider.keyLabel}
                        </Label>
                        <Input
                          placeholder={
                            savedKey.length > 0
                              ? `已保存 ${maskApiKey(savedKey)}，留空则不改`
                              : provider.keyPlaceholder
                          }
                          type={reveal[provider.id] ? "text" : "password"}
                        />
                      </TextField>

                      {provider.fields.map((field) =>
                        field.kind === "select" ? (
                          <Select
                            key={field.id}
                            value={draft.values[field.id] ?? field.defaultValue ?? ""}
                            onChange={(key: Key | null) => {
                              if (typeof key === "string") {
                                patch(provider.id, draft, { values: { ...draft.values, [field.id]: key } });
                              }
                            }}
                          >
                            <Label className="text-[13px] font-medium text-foreground/80">
                              {field.label}
                            </Label>
                            <Select.Trigger>
                              <Select.Value>
                                {() => (
                                  <span className="text-[13px]">
                                    {field.options?.find(
                                      (option) => option.value === draft.values[field.id],
                                    )?.label ?? "请选择"}
                                  </span>
                                )}
                              </Select.Value>
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <ListBox>
                                {field.options?.map((option) => (
                                  <ListBox.Item
                                    key={option.value}
                                    id={option.value}
                                    textValue={option.label}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-[13px]">{option.label}</span>
                                      <span className="text-[11px] text-muted">
                                        <span className="tech">{option.value}</span>
                                        {option.note ? option.note : ""}
                                      </span>
                                    </div>
                                    <ListBox.ItemIndicator />
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        ) : (
                          <TextField
                            key={field.id}
                            value={draft.values[field.id] ?? ""}
                            onChange={(value) => patch(provider.id, draft, { values: { ...draft.values, [field.id]: value } })}
                          >
                            <Label className="text-[13px] font-medium text-foreground/80">
                              {field.label}
                            </Label>
                            <Input placeholder={field.placeholder} />
                          </TextField>
                        ),
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() =>
                          setReveal((current) => ({ ...current, [provider.id]: !current[provider.id] }))
                        }
                      >
                        {reveal[provider.id] ? "隐藏" : "显示"}
                      </Button>
                      <Button size="sm" variant="primary" onPress={() => save(provider, draft)}>
                        保存到浏览器
                      </Button>
                      <Button
                        isPending={testing === provider.id}
                        size="sm"
                        variant="secondary"
                        onPress={() => void test(provider, draft)}
                      >
                        测试连通
                      </Button>
                      {savedKey.length > 0 ? (
                        <Button size="sm" variant="danger-soft" onPress={() => clear(provider)}>
                          清除密钥
                        </Button>
                      ) : null}
                    </div>

                    {!readout.usable && readout.missingFields.length > 0 ? (
                      <Alert status="warning">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>还差必填项</Alert.Title>
                          <Alert.Description>
                            {readout.missingFields.join("、")} 没填，出图会直接被代理拦下。
                          </Alert.Description>
                        </Alert.Content>
                      </Alert>
                    ) : null}
                  </section>
                );
              })}
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close">完成</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
