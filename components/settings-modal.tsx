"use client";

import {
  Alert,
  Button,
  Chip,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  toast,
} from "@heroui/react";
import { CircleInfo } from "@gravity-ui/icons";
import { useState } from "react";

import { parseUpstreamError } from "@/lib/errors";

interface SettingsModalProps {
  configured: boolean | null;
  source: "session" | "env" | null;
  onRecheck: () => void;
}

export function SettingsModal({ configured, onRecheck, source }: SettingsModalProps) {
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  const submitKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith("sk-")) {
      toast.danger("密钥格式不正确", { description: "SenseNova 密钥应以 sk- 开头" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sensenova/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setKeyInput("");
        toast.success("会话密钥已保存到服务端内存", {
          description: "重启服务后失效；环境变量密钥始终优先展示",
        });
        onRecheck();
      } else {
        const failure = parseUpstreamError(data, res.status);
        toast.danger(failure.hint, { description: failure.message });
      }
    } catch (error) {
      toast.danger("保存失败", { description: error instanceof Error ? error.message : "网络异常" });
    } finally {
      setSaving(false);
    }
  };

  const clearSessionKey = async () => {
    setSaving(true);
    try {
      await fetch("/api/sensenova/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      toast.info("已清除会话密钥");
      onRecheck();
    } finally {
      setSaving(false);
    }
  };

  const statusText =
    source === "env"
      ? "环境变量已配置（推荐，服务端 .env.local）"
      : source === "session"
        ? "会话密钥已配置（仅存服务端内存，重启服务后需重新输入）"
        : "未检测到任何密钥";

  return (
    <Modal>
      <Modal.Trigger aria-label="打开设置" className="rounded-xl">
        <Chip color={configured ? "success" : configured === false ? "warning" : "default"} variant="soft">
          {configured === null ? (
            <Spinner size="sm" />
          ) : configured ? (
            source === "session" ? "API 密钥：会话已配置" : "API 密钥：已配置"
          ) : (
            "API 密钥：未配置"
          )}
        </Chip>
      </Modal.Trigger>
      <Modal.Backdrop>
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

              <TextField
                isDisabled={saving}
                value={keyInput}
                onChange={setKeyInput}
              >
                <Label>输入会话密钥（可选，快速测试用）</Label>
                <Input
                  placeholder="sk-……（platform.sensenova.cn 控制台创建）"
                  type="password"
                />
              </TextField>
              <div className="flex flex-wrap justify-end gap-2">
                {source === "session" ? (
                  <Button isDisabled={saving} variant="danger-soft" onPress={() => void clearSessionKey()}>
                    清除会话密钥
                  </Button>
                ) : null}
                <Button
                  isDisabled={keyInput.trim().length === 0}
                  isPending={saving}
                  variant="primary"
                  onPress={() => void submitKey()}
                >
                  保存到服务端
                </Button>
              </div>

              <div className="flex flex-col gap-2 text-sm">
                <p className="text-muted">生产推荐（密钥完全不经过浏览器）：</p>
                <ol className="list-inside list-decimal space-y-1 text-muted">
                  <li>
                    复制 <code className="rounded bg-default px-1">.env.example</code> 为{" "}
                    <code className="rounded bg-default px-1">.env.local</code>，填入{" "}
                    <code className="rounded bg-default px-1">SENSENOVA_API_KEY=sk-xxx</code>
                  </li>
                  <li>重启开发/生产服务</li>
                </ol>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={onRecheck}>
                重新检查
              </Button>
              <Button slot="close">完成</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
