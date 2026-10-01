/**
 * 服务商注册表：一个 provider = 一套鉴权字段 + 一批模型 + 一个代理路径。
 *
 * 加 GPT Image / Nano Banana 时只需在这里加一条 descriptor、在 lib/models.ts 里
 * 补它的模型常量、再写一个把 StudioParams 翻译成它请求体的 builder，
 * 设置界面与浏览器侧存储都按 descriptor 自动长出来，不用改 UI 代码。
 */

import {
  QWEN_IMAGE_3,
  QWEN_REGIONS,
  QWEN_MODELS,
  resolveQwenBaseUrl,
  type ModelInfo,
} from "./models";
import { GPT_IMAGE_BASE_URL, GPT_IMAGE_MODELS } from "./gpt-image";
import { SENSENOVA_BASE_URL, SENSENOVA_MODELS } from "./sensenova";

export interface ProviderFieldOption {
  value: string;
  label: string;
  note?: string;
}

export interface ProviderField {
  /** 存进浏览器配置与表单的键名 */
  id: string;
  label: string;
  kind: "text" | "select";
  /** 浏览器 → 本站代理的请求头名；代理只转发，不落盘 */
  header: string;
  /** 服务端环境变量回退（自托管单用户） */
  env?: string;
  placeholder?: string;
  help?: string;
  options?: ProviderFieldOption[];
  /** 返回 true 表示这个值下该字段必填 */
  requiredWhen?: (values: Record<string, string>) => boolean;
  defaultValue?: string;
}

export interface ProviderDescriptor {
  id: string;
  /** 设置界面里的标题 */
  name: string;
  /** 顶栏状态点 tooltip 用的短名 */
  shortName: string;
  keyLabel: string;
  keyPlaceholder: string;
  /** 密钥的请求头与环境变量 */
  keyHeader: string;
  keyEnv: string;
  /** 密钥格式校验说明（界面文案） */
  keyHint: string;
  /** 商标资源 key，见 components/brand/provider-logo.tsx；缺省用短名首字图章 */
  logo?: string;
  /** true = 该 logo 只是图形标记（不含 wordmark），砖块上要另写一行服务名 */
  logoIsMark?: boolean;
  docsUrl: string;
  docsLabel: string;
  /** 本站代理的出图路由 */
  generationPath: string;
  /** 连通性探测路由；null 表示该服务商暂不支持免出图探测 */
  verifyPath: string | null;
  fields: ProviderField[];
  models: ModelInfo[];
}

const QWEN_PROVIDER: ProviderDescriptor = {
  id: "qwen",
  name: "阿里云百炼 · 千问图像",
  shortName: "百炼",
  keyLabel: "百炼 API 密钥",
  keyPlaceholder: "sk-……（百炼控制台创建）",
  keyHeader: "x-qwen-key",
  keyEnv: "DASHSCOPE_API_KEY",
  keyHint: "sk- 开头、不少于 9 个字符；Key 与区域配对，不跨区通用",
  logo: "bailian",
  docsUrl: "https://help.aliyun.com/zh/model-studio/qwen-image-generation-and-editing-api-reference",
  docsLabel: "千问-图像生成与编辑 API 参考",
  generationPath: "/api/qwen/generation",
  verifyPath: "/api/qwen/verify",
  fields: [
    {
      id: "region",
      label: "服务区域",
      kind: "select",
      header: "x-qwen-region",
      env: "QWEN_REGION",
      defaultValue: "cn-beijing",
      options: QWEN_REGIONS.map((region) => ({
        value: region.id,
        label: region.label,
        note: region.requiresWorkspace ? "" : "（无需业务空间 ID）",
      })),
    },
    {
      id: "workspaceId",
      label: "业务空间 ID（WorkspaceId）",
      kind: "text",
      header: "x-qwen-workspace",
      env: "QWEN_WORKSPACE_ID",
      placeholder: "百炼控制台业务空间页可查，形如 llm-xxxx",
      help: "会拼进主机名：https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1",
      requiredWhen: (values) => {
        const region = QWEN_REGIONS.find((item) => item.id === (values.region || "cn-beijing"));
        return region?.requiresWorkspace === true;
      },
    },
  ],
  models: QWEN_MODELS,
};

const SENSENOVA_PROVIDER: ProviderDescriptor = {
  id: "sensenova",
  name: "商汤 SenseNova · 图像",
  shortName: "SenseNova",
  keyLabel: "SenseNova API 密钥",
  keyPlaceholder: "sk-……（platform.sensenova.cn 控制台创建）",
  keyHeader: "x-sensenova-key",
  keyEnv: "SENSENOVA_API_KEY",
  keyHint: "sk- 开头；密钥仅存浏览器",
  docsUrl: "https://platform.sensenova.cn/docs",
  docsLabel: "SenseNova 开放平台文档",
  generationPath: "/api/sensenova/generation",
  verifyPath: "/api/sensenova/verify",
  logo: "sensenova",
  fields: [],
  models: SENSENOVA_MODELS,
};

const GPT_IMAGE_PROVIDER: ProviderDescriptor = {
  id: "openai",
  name: "OpenAI · GPT Image",
  shortName: "GPT Image",
  keyLabel: "OpenAI API 密钥",
  keyPlaceholder: "sk-……（platform.openai.com 创建，sk-proj- 也可以）",
  keyHeader: "x-openai-key",
  keyEnv: "OPENAI_API_KEY",
  keyHint: "sk- 或 sk-proj- 开头；密钥仅存浏览器",
  logo: "openai",
  logoIsMark: true,
  docsUrl: "https://platform.openai.com/docs/api-reference/images",
  docsLabel: "OpenAI Images API 参考",
  generationPath: "/api/openai/generation",
  verifyPath: "/api/openai/verify",
  fields: [
    {
      id: "baseUrl",
      label: "上游地址（留空 = 官方 api.openai.com）",
      kind: "text",
      header: "x-openai-base",
      env: "OPENAI_BASE_URL",
      placeholder: "https://api.openai.com/v1",
      help: "本机直连 api.openai.com 不通时才需要填：填你自己的 OpenAI 兼容网关（含 /v1）。",
    },
  ],
  models: GPT_IMAGE_MODELS,
};

export const PROVIDERS: ProviderDescriptor[] = [QWEN_PROVIDER, SENSENOVA_PROVIDER, GPT_IMAGE_PROVIDER];

/** 按模型 ID 反查它属于哪家服务商（模型 ID 全局唯一）。 */
/** 首屏默认模型：千问 3.0 均衡版（4500 token 上限最能吃下 SKILL 全文） */
export const DEFAULT_MODEL_ID = QWEN_IMAGE_3;

export function findModelById(
  modelId: string,
): { provider: ProviderDescriptor; model: ModelInfo } | null {
  for (const provider of PROVIDERS) {
    const model = provider.models.find((item) => item.id === modelId);
    if (model) {
      return { provider, model };
    }
  }
  return null;
}

export function findProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function providerForModel(modelId: string): ProviderDescriptor | undefined {
  return PROVIDERS.find((provider) => provider.models.some((model) => model.id === modelId));
}

/** 该服务商的默认配置值（字段声明的 defaultValue）。 */
export function defaultProviderValues(provider: ProviderDescriptor): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of provider.fields) {
    values[field.id] = field.defaultValue ?? "";
  }
  return values;
}

export function missingRequiredFields(
  provider: ProviderDescriptor,
  values: Record<string, string>,
): string[] {
  return provider.fields
    .filter((field) => field.requiredWhen?.(values) === true && (values[field.id] ?? "").trim().length === 0)
    .map((field) => field.label);
}

/** 拼上游 base URL；provider 专属逻辑集中在这里。 */
export function resolveProviderBaseUrl(
  providerId: string,
  values: Record<string, string>,
): { baseUrl: string | null; error: string | null } {
  if (providerId === "sensenova") {
    // SenseNova 只有一个通用 base URL，没有区域 / 业务空间概念
    return { baseUrl: SENSENOVA_BASE_URL, error: null };
  }
  if (providerId === "openai") {
    // 官方只有一个 base；本机直连不通时用户可填自己的 OpenAI 兼容网关（含 /v1）
    const custom = (values.baseUrl ?? "").trim().replace(/\/+$/, "");
    if (custom.length === 0) {
      return { baseUrl: GPT_IMAGE_BASE_URL, error: null };
    }
    if (!/^https?:\/\//i.test(custom)) {
      return { baseUrl: null, error: "上游地址必须以 http:// 或 https:// 开头（含 /v1）" };
    }
    return { baseUrl: custom, error: null };
  }
  if (providerId === "qwen") {
    const region = values.region || "cn-beijing";
    const baseUrl = resolveQwenBaseUrl(region, values.workspaceId ?? "");
    return {
      baseUrl,
      error: baseUrl
        ? null
        : `区域「${region}」要填业务空间 ID（它要拼进主机名），或改选通用域名。`,
    };
  }
  return { baseUrl: null, error: `未知服务商 ${providerId}` };
}
