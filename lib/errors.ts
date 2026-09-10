import type { UpstreamErrorBody } from "@/lib/models";

const ERROR_HINTS: Record<string, string> = {
  invalid_request_error: "请求参数不合法，请检查输入后重试。",
  failed_precondition_error: "处理失败（编码失败 / 引擎不可用 / 安全检查未通过），请更换输入内容后重试。",
  permission_denied_error: "当前请求语言不受支持，请改用中文或英文描述提示词。",
  not_found_error: "模型 ID 不存在或已下线，请检查模型选择。",
  canceled_error: "请求已取消。",
  quota_exceeded_error: "请求过于频繁或额度已用尽，自动重试后仍失败，请稍后再试。",
  internal_server_error: "服务器内部错误，请点击重试。",
  server_config_error: "服务端配置缺失，请按设置面板提示完成配置。",
  config_error: "未提供 API 密钥。请在右上角「API 密钥」里填入你自己的 SenseNova 密钥（仅存于你的浏览器）。",
  network_error: "无法连接后端代理，请确认服务正在运行。",
  unknown_error: "发生未知错误。",
};

export interface ApiFailure {
  type: string;
  code: string;
  message: string;
  hint: string;
  /** 500 内部错误时展示重试按钮 */
  retryable: boolean;
}

export function mapErrorHint(type: string, status?: number): string {
  if (ERROR_HINTS[type]) {
    return ERROR_HINTS[type];
  }
  switch (status) {
    case 400:
      return ERROR_HINTS.invalid_request_error;
    case 403:
      return ERROR_HINTS.permission_denied_error;
    case 404:
      return ERROR_HINTS.not_found_error;
    case 408:
      return ERROR_HINTS.canceled_error;
    case 429:
      return ERROR_HINTS.quota_exceeded_error;
    case 500:
      return ERROR_HINTS.internal_server_error;
    default:
      return ERROR_HINTS.unknown_error;
  }
}

export function parseUpstreamError(raw: unknown, status: number): ApiFailure {
  const body = (raw ?? {}) as UpstreamErrorBody;
  const err = body.error ?? {};
  const type = typeof err.type === "string" && err.type.length > 0 ? err.type : "unknown_error";
  const code = err.code === undefined ? String(status) : String(err.code);
  const message =
    typeof err.message === "string" && err.message.length > 0
      ? err.message
      : `上游返回 HTTP ${status}`;
  return {
    type,
    code,
    message,
    hint: mapErrorHint(type, status),
    retryable: status >= 500 && type !== "server_config_error",
  };
}
