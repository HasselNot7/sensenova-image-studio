# 开发提示词：SenseNova 图像创作工作台（HeroUI v3 + Next.js）

把本文件完整作为需求规格执行。所有 API 事实均已从 https://platform.sensenova.cn/docs 官方文档核实，**禁止修改接口契约、参数名、取值范围或臆造不存在的字段**。有疑问先提出，不要猜。

## 1. 技术栈（硬性要求）

- Next.js（App Router）+ TypeScript，React 19
- Tailwind CSS v4
- HeroUI v3：`npm install @heroui/react`（当前 3.2.4）。v3 是复合组件 API（如 `Card.Header`、`Select.Item`），**不需要** `<Provider>` 包裹。接入前先读官方文档 https://heroui.com/docs/react/getting-started/quick-start 确认写法，不要按 v2 的旧写法（如 `HeroUIProvider`、`next.config` plugin）配置。
- UI 组件全部优先使用 HeroUI（Button、Tabs、Select、Input/Textarea、Switch、Modal、Toast/TriangleAlert、Skeleton、Card、Tooltip 等），不引其他组件库。

## 2. 应用形态

一个中文界面的「SenseNova 图像创作工作台」，两个 Tab：

1. **文生图**：模型下拉可切换 `sensenova-u1-fast` 和 `sensenova-u1.5-lite`，输入 prompt + 参数面板，生成图片。
2. **图片编辑**（仅 `sensenova-u1.5-lite`）：输入参考图（公网 URL 或本地文件上传转 Base64 Data-URL）+ 编辑指令，调用 edits 接口。

另有：历史记录侧栏/面板、设置入口（显示密钥配置状态）、错误提示 Toast。

## 3. API 事实（官方文档核实，必须严格遵守）

Base URL：`https://token.sensenova.cn/v1`
鉴权：HTTP Header `Authorization: Bearer <SENSENOVA_API_KEY>`，密钥为 `sk-` 开头，在 platform.sensenova.cn 控制台创建。
两个模型都使用**独立图像接口，不是 Chat Completions**。

### 3.1 文生图 `POST /v1/images/generations`

两个模型共用此端点。请求/响应均为 JSON。

**`sensenova-u1.5-lite` 参数表：**

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `model` | string | 是 | — | `sensenova-u1.5-lite` |
| `prompt` | string | 是 | — | 图像描述文本 |
| `size` | string | 否 | `auto` | 宽高必须是 32 的倍数，最小 512，最大 4096，最大比例 3:1 或 1:3。建议常量：`2048x2048`(1:1)、`2720x1536`(16:9)、`1536x2720`(9:16)、`1664x2496`(2:3)、`2496x1664`(3:2)、`4096x4096`(1:1 4K) |
| `n` | integer | 否 | `1` | **仅支持 1**，UI 不提供多张选项 |
| `watermark` | boolean | 否 | `true` | 官方 Logo 水印；false 公测免费。**调用时必须显式传该字段** |
| `output_format` | string | 否 | `png` | `png` \| `jpeg` \| `webp`（图片文件格式，不决定返回方式） |
| `response_format` | string | 否 | `b64_json` | `b64_json` \| `url`（url 为 24 小时临时链接）；`data[].b64_json` 与 `data[].url` 不同时出现 |
| `prompt_extend` | boolean | 否 | `true` | 提示词自动润色，扩写失败自动回退原始 prompt |

**`sensenova-u1-fast` 参数表（明显更少，不要混用）：**

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `model` | string | 是 | — | 固定 `sensenova-u1-fast` |
| `prompt` | string | 是 | — | 最大 4096 token，UI 要有字符计数与超限提醒 |
| `size` | string | 否 | `2752x1536` | 只能从这 11 个 2K 常量中选：`1664x2496`(2:3)、`2496x1664`(3:2)、`1760x2368`(3:4)、`2368x1760`(4:3)、`1824x2272`(4:5)、`2272x1824`(5:4)、`2048x2048`(1:1)、`2752x1536`(16:9)、`1536x2752`(9:16)、`3072x1376`(21:9)、`1344x3136`(9:21)。Select 下拉列出常量+比例标签，禁止自由输入 |
| `n` | integer | 否 | `1` | 生成数量 |
| `watermark` | boolean | 否 | `true` | 同上，必须显式传 |

⚠️ `sensenova-u1-fast` **没有** `response_format` / `output_format` / `prompt_extend` 参数，不要发送。
⚠️ `sensenova-u1-fast` 返回的图片 URL **仅 1 小时有效**（u1.5-lite 是 24 小时）。

**成功响应结构（两模型一致）：**

```json
{
  "created": 1713167890,
  "data": [
    { "url": "https://cdn.sensenova.dev/gen/..." }
  ]
}
```

（`response_format=b64_json` 时 `data[0]` 内为 `b64_json` 字段而非 `url`。）

### 3.2 图片编辑 `POST /v1/images/edits`（仅 sensenova-u1.5-lite）

同步接口，必须传输入图片，不能仅传 prompt。

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `model` | string | 是 | — | `sensenova-u1.5-lite` |
| `images` | array\<object\> | 是 | — | 每项含 `image_url`；**第一张为主编辑图** |
| `images[].image_url` | string | 是 | — | 仅支持：完整公网 http/https 链接，或带 `data:image/*;base64,` 前缀的 Data-URL。**不支持无前缀纯 Base64**。链接不可访问/非图片/解码失败会被直接驳回 |
| `prompt` | string | 是 | — | 编辑指令，去空格后不可为空 |
| `n` | integer | 否 | `1` | 仅支持 1 |
| `size` | string | 否 | `auto` | `auto` 自动适配主图；其余同 3.1 u1.5-lite 的 size 规则 |
| `response_format` | string | 否 | `b64_json` | `b64_json` \| `url`（24 小时临时链接） |
| `watermark` | boolean | 否 | `true` | 显式传 |
| `prompt_extend` | boolean | 否 | `true` | 显式传 |

本地文件上传：前端读成 `data:image/png;base64,...` 完整 Data-URL 再放入 `images[].image_url`。

### 3.3 错误响应（统一结构）

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "3",
    "message": "invalid temperature, should in [0,2]."
  }
}
```

| HTTP | type | 含义 | 前端处理 |
|---|---|---|---|
| 400 | `invalid_request_error` | 参数不合法 | 展示 message |
| 400 | `failed_precondition_error` | 编码失败/引擎不可用/安全检查未通过 | 展示 message，提示换输入重试 |
| 403 | `permission_denied_error` | 不支持当前语言的请求 | 提示改用中文/英文 prompt |
| 404 | `not_found_error` | 模型 ID 不存在或已下线 | 提示检查模型选择 |
| 408 | `canceled_error` | 客户端取消 | 静默处理 |
| 429 | `quota_exceeded_error` | 速率/额度超限 | **指数退避自动重试**（1s/2s/4s，最多 3 次），仍失败则 Toast 提示 |
| 500 | `internal_server_error` | 服务器内部错误 | 可重试按钮 |

## 4. 架构：后端代理（密钥不落前端）

- API Key 只存在于服务端环境变量 `SENSENOVA_API_KEY`（`.env.local`，提供 `.env.example`）。
- 新建 Route Handler：`app/api/sensenova/generations/route.ts` 和 `app/api/sensenova/edits/route.ts`，接收前端 JSON，原样附加 `Authorization` 后转发到 `https://token.sensenova.cn/v1/images/{generations|edits}`，并把上游状态码与响应体透传给前端（保留 `error` 结构供前端映射）。
- **URL 时效规避（关键设计）**：Route Handler 在检测到响应含 `data[].url` 时，**在服务端立即下载该图片并转为 `b64_json` Data-URL 再返回前端**（u1-fast 的 URL 只有 1 小时寿命，这是必须做的，不是可选）。前端拿到的结果始终是可长期保存的 data URL。
- 转发超时设置合理值（生成类接口慢，建议 ≥120s），并处理 fetch 异常返回统一错误 JSON。
- 图片生成是长耗时请求：Route Handler 保持同步等待即可（官方接口为同步返回），无需轮询。

## 5. 功能需求

1. **参数面板按所选模型动态渲染**（u1-fast 隐藏 `response_format`/`output_format`/`prompt_extend`，size 用固定常量下拉；u1.5-lite 给全量）。`watermark` 两模型都必须显式随请求发送。
2. **历史记录**：localStorage 保存每次成功生成（prompt、模型、参数、结果 data-URL、时间）。这是持久化图片的唯一可靠方式（临时链接会失效）。可点开回看、删除、清空。
3. **下载**：结果图提供下载按钮，文件名含模型名+时间戳，扩展名与格式一致。
4. **加载状态**：请求期间按钮 loading + 结果区 Skeleton；禁用重复提交。
5. **错误处理**：按 3.3 表格把 type 映射为中文提示，同时展示上游 `error.message` 原文；429 走自动退避重试。
6. **编辑 Tab 输入校验**：本地文件读为 Data-URL 后需小于合理体积提醒（base64 会膨胀约 33%）；URL 输入校验 `http(s)://` 前缀；提交前 `prompt` 非空校验。
7. UI 全部中文，响应式（桌面双栏、移动单栏），暗色/亮色主题跟随系统（HeroUI/Tailwind v4 机制）。

## 6. 验收标准

- `npm run build` 通过，无 TS 错误。
- 未配置 `SENSENOVA_API_KEY` 时给出明确的服务端错误提示而非崩溃。
- 三个请求（u1-fast 文生图、u1.5-lite 文生图、u1.5-lite 编辑）的请求体与本文件 3.1/3.2 参数表逐字段一致（可用 mock 断言）。
- 浏览器端任何网络面板/存储中都**不得出现** `sk-` 密钥。
- 生成结果与历史记录中的图片在 24 小时后仍可显示（因为是 data URL）。

## 7. 禁止事项

- 禁止用 Chat Completions 接口调这两个模型。
- 禁止给 u1-fast 发送 `response_format`、`output_format`、`prompt_extend`。
- 禁止把 u1.5-lite 的自由 `WIDTHxHEIGHT` 校验规则套到 u1-fast（u1-fast 只能选 11 个常量）。
- 禁止在前端直连 `token.sensenova.cn`（全部走后端代理）。
- 禁止引入 v2 时代的 HeroUI 配置（`HeroUIProvider`、`@heroui/theme`、`tailwind.config.ts` 主题注册等）——以 v3 官方文档为准。
