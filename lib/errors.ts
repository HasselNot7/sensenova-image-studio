import type { UpstreamErrorBody } from "./models";

/**
 * DashScope 用顶层 { code, message, request_id } 报错，code 是点分字符串（如 Throttling.RateQuota）。
 * 官方错误码表很长且会增改，这里只映射本项目实测会遇到的几类；未收录的照常把 message 透出来。
 */
const ERROR_HINTS: Record<string, string> = {
  InvalidParameter: "请求参数不合法，请检查尺寸、张数与提示词长度。",
  InvalidApiKey: "API Key 无效：请确认密钥正确，且与该区域 / 业务空间匹配（Key 不跨区通用）。",
  NotAuthorize: "当前账号无权调用该模型，请到百炼控制台确认已开通。",
  AccessDenied: "访问被拒绝：账号未开通该模型或该业务空间无权限。",
  "Throttling.RateQuota": "触发限流，已自动重试仍失败，请稍后再试。",
  Throttling: "触发限流，已自动重试仍失败，请稍后再试。",
  Arrearage: "账号欠费或免费额度用尽，请到百炼充值后重试。",
  DataInspectionFailed: "内容安全审核未通过，请更换照片或精简描述后重试。",
  IPInfringementSuspect: "疑似侵权风险：输入图或提示词触发了上游的版权拦截。",
  InternalError: "上游服务内部错误，请点击重试。",
  TaskFailed: "任务执行失败，请点击重试或更换参数。",
  Timeout: "上游处理超时，请点击重试（在线蒸馏与出图最长各等 5 分钟）。",
  config_error: "未提供 API 密钥。点右上角齿轮 →「设置 · 服务商」填该家的 sk- 密钥。",
  server_config_error: "服务端配置缺失，请按设置面板提示完成配置。",
  network_error: "无法连接后端代理，请确认服务正在运行。",
  unknown_error: "发生未知错误。",
};

export interface ApiFailure {
  /** 归一化后的错误标识：上游 code，或 HTTP 状态推导出的类型 */
  type: string;
  code: string;
  message: string;
  hint: string;
  retryable: boolean;
}

function hintFor(code: string, status: number): string {
  if (ERROR_HINTS[code]) {
    return ERROR_HINTS[code];
  }
  const family = code.split(".")[0];
  if (ERROR_HINTS[family]) {
    return ERROR_HINTS[family];
  }
  switch (status) {
    case 400:
      return ERROR_HINTS.InvalidParameter;
    case 401:
      return ERROR_HINTS.InvalidApiKey;
    case 403:
      return ERROR_HINTS.NotAuthorize;
    case 408:
      return ERROR_HINTS.Timeout;
    case 429:
      return ERROR_HINTS.Throttling;
    case 500:
    case 502:
    case 503:
      return ERROR_HINTS.InternalError;
    default:
      return ERROR_HINTS.unknown_error;
  }
}

export function parseUpstreamError(raw: unknown, status: number): ApiFailure {
  const body = (raw ?? {}) as UpstreamErrorBody;
  const openaiStyle = body.error ?? {};
  const code =
    typeof body.code === "string" && body.code.length > 0
      ? body.code
      : typeof openaiStyle.code === "string" && openaiStyle.code.length > 0
        ? openaiStyle.code
        : String(status);
  const type =
    typeof openaiStyle.type === "string" && openaiStyle.type.length > 0 ? openaiStyle.type : code;
  const message =
    typeof body.message === "string" && body.message.length > 0
      ? body.message
      : typeof openaiStyle.message === "string" && openaiStyle.message.length > 0
        ? openaiStyle.message
        : `上游返回 HTTP ${status}${body.request_id ? `（request_id ${body.request_id}）` : ""}`;
  return {
    type,
    code,
    message: body.request_id ? `${message} [request_id ${body.request_id}]` : message,
    hint: hintFor(code, status),
    retryable: status >= 500 || code.startsWith("Throttling") || status === 408,
  };
}
