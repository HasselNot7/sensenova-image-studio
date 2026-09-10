"use client";

import {
  Alert,
  Button,
  Chip,
  Input,
  Label,
  Modal,
  TextField,
  toast,
} from "@heroui/react";
import { CircleInfo } from "@gravity-ui/icons";
import { useEffect, useState } from "react";

import { sensenovaFetch } from "@/lib/api-client";
import {
  clearStoredApiKey,
  getStoredApiKey,
  isValidApiKey,
  maskApiKey,
  setStoredApiKey,
} from "@/lib/api-key";
import { parseUpstreamError } from "@/lib/errors";

interface SettingsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 设置 · API 密钥（BYOK）。
 * 密钥存浏览器 localStorage，请求经本站代理以 x-sensenova-key 头透传给 SenseNova，服务端不落盘/不记日志。
 */
export function SettingsModal({ isOpen, onOpenChange }: SettingsModalProps) {
  const [localKey, setLocalKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [serverConfigured, setServerConfigured] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    // 延后到微任务，避免 effect 体内同步 setState
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLocalKey(getStoredApiKey());
      }
    });
    // 自托管单用户：服务器已配 SENSENOVA_API_KEY 时可免填（环境变量回退）。
    fetch("/api/sensenova/status")
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        if (!cancelled) {
          setServerConfigured(Boolean(data?.configured));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const configured = localKey.length > 0 || serverConfigured;

  const saveKey = () => {
    const trimmed = keyInput.trim();
    if (!isValidApiKey(trimmed)) {
      toast.danger("密钥格式不正确", { description: "应为 sk- 开头、非空，且不少于 9 个字符" });
      return;
    }
    setStoredApiKey(trimmed);
    setLocalKey(trimmed);
    setKeyInput("");
    setReveal(false);
    toast.success("密钥已保存到本浏览器", { description: "仅存于 localStorage，不上传到本站服务器" });
  };

  const clearKey = () => {
    clearStoredApiKey();
    setLocalKey("");
    setKeyInput("");
    toast.info("已清除浏览器中的密钥");
  };

  const testConnectivity = async () => {
    const key = (keyInput.trim() || localKey).trim();
    if (key.length === 0) {
      toast.warning("请先输入或保存密钥", { description: "测试用当前输入框的 Key（未填则用已保存的）" });
      return;
    }
    setTesting(true);
    try {
      const { status, ok, payload } = await sensenovaFetch("/api/sensenova/models", { keyOverride: key });
      if (ok) {
        const data = (payload as { data?: unknown }) ?? {};
        const count = Array.isArray(data.data) ? data.data.length : 0;
        toast.success("连通成功", { description: `该密钥可用模型 ${count} 个` });
      } else {
        const failure = parseUpstreamError(payload, status);
        toast.danger(failure.hint, { description: failure.message });
      }
    } catch (error) {
      toast.danger("测试失败", { description: error instanceof Error ? error.message : "网络异常" });
    } finally {
      setTesting(false);
    }
  };

  const statusText =
    localKey.length > 0
      ? `已保存到你的浏览器（${maskApiKey(localKey)}）`
      : serverConfigured
        ? "检测到服务器已配置 SENSENOVA_API_KEY（自托管回退），可直接使用"
        : "未配置：填入你自己的 sk- 密钥，仅保存在本机浏览器";

  const chipLabel =
    localKey.length > 0
      ? `API 密钥：已配置 ${maskApiKey(localKey)}`
      : serverConfigured
        ? "API 密钥：已配置（服务器）"
        : "API 密钥：未配置";

  return (
    <>
      <button
        type="button"
        aria-label="打开设置"
        className="cursor-pointer rounded-xl"
        onClick={() => onOpenChange(true)}
      >
        <Chip color={configured ? "success" : "warning"} variant="soft">
          {chipLabel}
        </Chip>
      </button>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="rounded-card sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
                <CircleInfo className="size-5" />
              </Modal.Icon>
              <Modal.Heading>设置 · API 密钥</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <Alert status={configured ? "success" : "danger"}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{configured ? "密钥可用" : "密钥缺失"}</Alert.Title>
                  <Alert.Description>{statusText}</Alert.Description>
                </Alert.Content>
              </Alert>

              <TextField value={keyInput} onChange={setKeyInput}>
                <Label>SenseNova API 密钥</Label>
                <Input
                  placeholder="sk-……（platform.sensenova.cn 控制台创建）"
                  type={reveal ? "text" : "password"}
                />
              </TextField>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  isDisabled={keyInput.length === 0}
                  size="sm"
                  variant="tertiary"
                  onPress={() => setReveal((v) => !v)}
                >
                  {reveal ? "隐藏" : "显示"}
                </Button>
                <Button isDisabled={keyInput.trim().length === 0} variant="primary" onPress={saveKey}>
                  保存到浏览器
                </Button>
                <Button isPending={testing} variant="secondary" onPress={() => void testConnectivity()}>
                  测试连通
                </Button>
                {localKey.length > 0 ? (
                  <Button variant="danger-soft" onPress={clearKey}>
                    清除
                  </Button>
                ) : null}
              </div>

              <p className="text-xs leading-relaxed text-muted">
                密钥仅保存在你的浏览器中，请求经本站服务器透传给 SenseNova，不落盘、不记日志；不信任本站者可自行本地部署。
              </p>
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
