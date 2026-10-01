# Skill 图像工作台

内置一批别人写好的**照片生图 Skill**，选中一个 → 上传你的照片 → 把 SKILL 原文整篇发给千问图像模型出图。
界面与工程结构沿用同作者的 [SenseNova 图像创作工作台](https://github.com/HasselNot7)（Next.js 16 + HeroUI v3 + Tailwind v4）。

## 能做什么

- **7 个内置 Skill**（`skills/` 下是作者原文，本站不改写）：
  - 抽象记忆双联 · Photo Abstract Editorial（ZzzLc0405）
  - 影像蒸馏 · 纸刊插画 Scene Distillation Zine v1.3（Zeejay0）
  - 实景拼贴 · 撕纸边界 Gathered Scenes Zine v1.3（Zeejay0）
  - 莫兰迪电影海报 · Morandi Cinematic Poster（Zeejay0，附一张作者成品示例，只给人看）
  - 拾景实况全流程 · Gathered Scenes Zine Live Flow v1.0（Zeejay0）
  - 钢笔淡彩旅行速写 · Azhu Pen & Wash Travel Sketch v0.23（azhu032）
  - 极简纸感 Zine 海报 · Minimal Zine Poster v0.3.1（LiamGvchi）
- **Skill 下拉里还有最后一档「无 Skill」**：选它就没有任何内置正文，输入框里那段话就是你发出去的全部提示词（不拼「本次补充」标题、不追加防泄漏禁令、不参与蒸馏档位，所以档位下拉和「蒸馏后发送」开关一起收掉）。参考照片变成可选：空手纯文生图，或挂图让模型编辑。历史记录里这条的 Skill 一栏写 `无 Skill`、发送方式写 `自写提示词`。
- **三家服务商、8 个模型**，设置界面按服务商分列，密钥各存各的：
  - 阿里云百炼 Qwen Image：`qwen-image-3.0-pro` / `3.0` / `2.0-pro` / `2.0`（文生图与图生图同一端点）。
  - 商汤 SenseNova：`sensenova-u1.5-lite`（文生图 + 图片编辑）、`sensenova-u1-fast`（只能文生图，尺寸是 11 个固定常量）。
  - OpenAI GPT Image：`gpt-image-2.5-sunburst` / `gpt-image-2.5-flare`（规范里还有 gpt-image-2 / 1.5 / 1 / 1-mini，按用户口径只挂 2.5 系两个）。没有反向提示词、seed、润色、水印这些参数，界面按能力表自动把它们藏掉。
  换模型时尺寸常量、可用参数（反向提示词 / 张数 / seed / 润色）与是否要参考照片都会跟着该模型的能力表变。
- 上传本地照片按该模型的输入图策略处理（长边滑杆 512~4096，千问默认 2048/3072，SenseNova 还能选「不压缩」），拼成 Data-URL。**发送正文源三档 + 蒸馏开关**：源可以是 `原文`（SKILL 全文直发）、`精简版`（`skills/<id>/distilled.md`，内置预蒸馏正文：删掉写给编程 agent 的流程指令，也删掉 Skill 自身的名称/作者/版本号/网址署名，保留画面决策与禁令）、`极简版`（`skills/<id>/minimal.md`，更短的一档，让 SenseNova 这类按字符计上限的模型不必先蒸馏就能直发）；再叠一个 `蒸馏后发送` 开关（配置一个 OpenAI 兼容 chat 端点现场压缩，失败不悄悄回退，结果按内容键缓存复用）。默认源是有精简版就用精简版（原文是排版好的教学文档，图像模型会把小节标题和示例词当海报文案画出来），精简版装不进当前模型上限时自动退到极简版；蒸馏开关对三档源都生效，因为用户补充也可能把正文顶过上界。界面全程如实标价，不替你截断。
- 历史记录存浏览器 IndexedDB（原图 + 256px 缩略图）；设置面板管 BYOK 密钥、区域与业务空间 ID。

## 快速开始

前置：Node 18 以上；一个百炼平台账号（密钥在百炼控制台创建，`sk-` 开头）。

```bash
npm install
npm run dev          # prebuild 钩子会先跑 build:skills 生成 lib/skills.generated.ts
```

打开 http://localhost:3000 → 右上角齿轮（未配置时带黄点）→ 「设置 · 服务商密钥」→ 选服务商（现在是「阿里云百炼 · 千问图像」）→ 填 `sk-` 密钥、选服务区域（北京/新加坡/…），区域不是 legacy 时还要填**业务空间 ID**（它要拼进主机名）→「测试连通」→「保存到浏览器」。没填就点生成会提示并自动弹到对应服务商小节。

校验：

```bash
npm run build   # 生产构建 + 类型检查
npm test        # 11 条请求体契约断言
```

## 部署（自托管给别人用）

```bash
npm run build
npm run start        # 默认 3000，可用 PORT=xxxx 改
```

想省掉「每人各填一次」，在服务器配 `.env.local` 的 `DASHSCOPE_API_KEY` + `QWEN_REGION` + `QWEN_WORKSPACE_ID` 作为单用户回退（见 `.env.example`）。那样所有访客共用你这把 Key，只适合自己或内网小圈子。

## 接口契约（改代码前先看）

Base URL 形如 `https://{WorkspaceId}.{region}.maas.aliyuncs.com/api/v1`（六个区域），或通用域名 `https://dashscope.aliyuncs.com/api/v1`。鉴权 `Authorization: Bearer <Key>`，**Key 与区域配对，不跨区通用**。

- 端点只有一个：`POST /services/aigc/multimodal-generation/generation`，同步返回，文生图与图生图共用。
- `input.messages` 只能 1 条、`role` 必须是 `user`；`content` 里 **1~3 个 `{image}` + 恰好 1 个 `{text}`**。
- 多张输入图时**最后一张定画面比例**。注意：Skill 自带的示例海报**不会**发给模型——图像模型把每张输入图都当内容，实测会把示例里的钟塔、星形和示例上的文字整张抄进结果，所以那些图只作为界面预览。
- `{image}` 接受公网 http(s) 链接或 `data:image/*;base64,`。输入图限制**按模型走**（`InputImagePolicy`）：SenseNova 长边可选（1024/1536/2048/3072 或不压）、10 MB 只是警告线、格式只收 png/jpeg/webp。千问 3.0 文档写宽高建议 384~2048、单张 ≤10 MB、6 种格式；千问 2.0 编辑文档写建议 384~3072（均为「建议」非硬拦截，已对官方页面核实，两份文档各自如此，不矛盾）。千问滑杆默认值跟各自文档（2048 / 3072），右端统一放宽到 4096——官方建议只到 3072，4096 是用户拍板的界面口径，超出建议不报错只会更慢。
- `{text}` 是提示词：3.0 系列建议 ≤4500 token，2.0 系列 ≤1300 token，超了上游截断。
- `parameters`：`n` 1~6、`size` **只接受 `"宽*高"`**（总像素 512\*512~2048\*2048、比例 ≤8:1；界面里的 `auto` = 干脆不发 `size`，实测发字面量 `auto` 上游回 `InvalidParameter: Expected format: '<width>*<height>'`）、`negative_prompt` ≤500 字符、`prompt_extend`（默认 true，本站默认关）、`prompt_extend_mode` `direct|agent`（agent 仅文生图，带图 400）、`enable_thinking`（需 `prompt_extend=true`）、`watermark`（默认 false）、`seed` `0~2147483647`。**2.0 系列没有 `prompt_extend_mode` / `enable_thinking`。**
- 成功响应在 `output.choices[].message.content[].image`，返回的是 **24 小时过期**的 OSS 链接；本站代理会在服务端把图下载下来转成 Data-URL 再回前端，所以历史里存的东西 24 小时后照样能看。
- 失败响应是顶层 `{code, message, request_id}`（不是 OpenAI 的 `error.type`），`lib/errors.ts` 按 code 映射中文提示。

## 蒸馏发送（可选，默认关）

超 token 的 Skill 可以先压缩再出图：正文超限时面板上会多出「蒸馏后发送」开关，打开后出图前先把 SKILL 原文交给一个 **OpenAI 兼容的 chat 端点**（`POST {base}/chat/completions`）压到目标 token 内，再把压缩结果当提示词发给图像模型。

- 配置在「设置 · 蒸馏模型」：base URL、模型名、密钥、目标 token（留空 = 出图模型建议上限的 90%）。本仓库不预设任何家的 chat 模型名，你得自己填手上那个。
- 蒸馏指令（`lib/distill.ts`）只做压缩：保留画面相关的决策与硬性禁令、删掉写给 agent 的工程指令（跑脚本、打包 ZIP、返回路径），并删掉 Skill 自身的身份字样（名称、作者 / @账号、版本号、官网、固定署名要求），不许新增主体/风格/颜色，保持原文语言，结尾保留一句「本提示词不是画面文案」的幕后指令。
- **蒸馏失败就中止出图**，绝不悄悄退回全文——否则你以为发出去的是短版。
- 蒸馏结果按「源正文 + 蒸馏模型 + 目标长度与单位」的内容键缓存在 localStorage（`lib/distill-cache.ts`，最多留 12 条）：换照片、改尺寸、刷新页面都不用再蒸馏一次；正文改一个字、或换蒸馏模型/目标就换键，不会把旧结果当成新的发出去。「用回源正文」只是关掉开关发源正文，缓存原样留着。
- 「查看发送正文」里会多一枚 chip 标明蒸馏自多少字符、用的哪个模型；历史记录里也记 `发送方式`。

## 关于「SKILL 全文直发」

`原文` 档的口径是：发送正文 = `skill.json` 里 `promptParts` 按序拼接的原文（+ 你填的「本次补充」），**一个字都不删改**，只在末尾追加一条 692 字符的 `[Off-screen direction]` 禁令（`lib/skills.ts` 的 `FULL_BODY_LEAK_BAN`）。这条禁令是必需的：图像模型会把提示词里的小节标题、示例词、甚至上游作者写死的「必须画上固定署名」原样画到海报上（实测 azhu 的 `——By Azhu Pen & Wash Travel Sketch v0.23` 出现在右下角），禁令只追加、不删原文。要真正去掉这些字样得用 `精简版` / `极简版`（我们自己写的 `distilled.md` 与 `minimal.md`，身份字样与固定署名直接从源头删掉）或开 `在线蒸馏`。

默认源：有精简版就用精简版；精简版装不进当前模型的提示词上限时自动退到极简版——这样 SenseNova u1.5-lite（5000 字符）不必先在线蒸馏也能出图。手动选过就按你选的来。

`无 Skill` 档不参与这套口径：发送正文 = 提示词输入框里你自己写的那段话，`trim()` 后原样发出——不拼 `## 用户本次补充要求` 标题、不追加 `FULL_BODY_LEAK_BAN`（那行禁令是给教学文档准备的，混进用户提示词只会污染它），也不走蒸馏档位与缓存，所以界面上的档位下拉和「蒸馏后发送」开关一起收掉。展示与发送仍然共用 `resolveSendPrompt`，只是 `noSkill: true` 在函数最前面短路返回，不会出现「标着原样发、实发加工过的」。

实测体积（`npm run build:skills` 打印）：

| Skill | 原文 字符 / 估算 token | 精简版 字符 / 估算 token | 极简版 字符 / 估算 token | 用极简版还免蒸馏的模型 |
| --- | --- | --- | --- | --- |
| azhu-pen-wash-travel-sketch | 3,375 / 844 | 2,333 / 584 | 1,283 / 321 | 六个模型全放得下（原文档也行） |
| photo-abstract-editorial | 7,324 / 4,238 | 2,683 / 2,468 | 1,413 / 1,308 | 千问 2.0 差 8 token |
| scene-distillation-zine | 30,268 / 7,647 | 8,097 / 2,036 | 1,217 / 1,072 | 六个模型全放得下 |
| scenes-gathered-zine | 38,638 / 9,729 | 14,107 / 3,547 | 1,563 / 1,383 | 千问 2.0 超 83 token |
| morandi-cinematic-poster | 17,280 / 4,353 | 5,327 / 1,332 | 4,231 / 1,058 | 六个模型全放得下 |
| scenes-gathered-zine-live-flow | 25,266 / 6,372 | 11,190 / 2,816 | 1,779 / 1,660 | 千问 2.0 超 360 token |
| gc-minimal-zine-poster | 31,688 / 8,116 | 6,214 / 1,567 | 2,445 / 624 | 六个模型全放得下 |

`极简版` 的口径由 `lib/skills.test.ts` 钉住：必须严格短于精简版，且放得进除千问 2.0 系（只有 1300 token）之外所有模型的上限。

估算规则在 `lib/prompt-budget.ts`（中日韩 1 字≈1 token、其余 4 字符≈1 token），只是可复算的近似，不是官方分词器。超限时界面挂黄色警告并允许你照发——上游怎么处理（截断或报错）由它决定，本站不替你改原文。

### SenseNova 的接口事实（`lib/sensenova.ts`）

端点 `https://token.sensenova.cn/v1`，`Authorization: Bearer sk-…`，是 OpenAI 风格的两个路径：`POST /images/generations`（文生图）与 `POST /images/edits`（图生图，仅 u1.5-lite）。`n` 只支持 1；`watermark` 必须显式传。u1-fast 的参数表只有 `model/prompt/size/n/watermark`，尺寸只能从 11 个固定常量里选、prompt ≤4096 token；u1.5-lite 另有 `output_format`/`response_format`/`prompt_extend`，**prompt ≤5000 字符（2026-09-28 实测上游报错 `invalid prompt, should not exceed 5000 characters`，是字符数不是 token，界面与蒸馏目标都按字符口径）**，自定义尺寸要求宽高都是 32 的倍数、512~4096、比例 ≤3:1。返回的图片链接 u1-fast 1 小时、u1.5-lite 24 小时过期 → 代理同样转成 Data-URL。「测试连通」走 `GET /v1/models`，不出图、不产生费用。

### OpenAI GPT Image 的接口事实（`lib/gpt-image.ts`）

事实来源是 OpenAI 官方 OpenAPI 规范（`github.com/openai/openai-openapi` 的 `openapi.yaml`，2026-09-29 拉取核对），下面每一条都取自规范原文，没标注的本站就不发明。

端点 `https://api.openai.com/v1`，`Authorization: Bearer sk-…`。`POST /images/generations` 文生图；`POST /images/edits` 图生图，**支持 `application/json`**，输入图写成 `images: [{ image_url }]`，官方写明 `image_url` 可以是完整链接**或 base64 Data-URL**（`maxLength: 20971520` 字符），所以本站不必走 multipart 上传。`prompt` 最长 32000 字符；`n` 1~10；输入图最多 16 张，格式 png/webp/jpg、单张 <50MB —— 但 Data-URL 通道要按 20971520 **字符**算，Base64 膨胀约 4/3，所以本站把原图天花板按 15MB 硬拦。

尺寸：规范里 `gpt-image-2`、`gpt-image-2.5-sunburst`、`gpt-image-2.5-flare`（含日期快照）支持任意 `WIDTHxHEIGHT`，官方约束是宽高都能被 16 整除、比例 1:3 ~ 3:1、最大 `3840x2160`，且写明超过 `2560x1440` 属实验性；其余模型只有 `1024x1024` / `1536x1024` / `1024x1536`。本站只挂 2.5 系两个，所以尺寸校验统一走任意分辨率那一套。界面上的 `auto` = 干脆不发 `size`。

响应：GPT image 模型**没有** `response_format` 参数，规范写「always return base64-encoded images」，因此不存在千问/SenseNova 那种临时链接过期问题，代理直接拼 Data-URL。

未接入、一律不发（本站界面没有对应控件，发了就是替用户做决定）：`quality`（low/medium/high，2.5 系另有 xhigh/max）、`background`（transparent/opaque/auto）、`input_fidelity`（high/low）、`moderation`、`output_format`、`output_compression`、`stream`/`partial_images`。「测试连通」走 `GET /models`，不出图、不产生费用。

**上游地址可改**：2026-09-29 实测这台机器直连 `api.openai.com` 不通（`curl` 21 秒超时，同期 `dashscope.aliyuncs.com` 正常响应），所以设置界面给这家加了一栏「上游地址」——留空走官方，填自己的 OpenAI 兼容网关时要含 `/v1`（服务端回退变量 `OPENAI_BASE_URL`）。因此本仓库只验到「路由 + 参数校验 + 转发 + 错误映射」这一层，真实出图要在能连通 OpenAI 的网络下才算跑通。

**未核实**：各模型的定价与 `sunburst` / `flare` 的定位差别——规范里两者参数完全对称，所以模型描述里只写尺寸与画质取值范围，不写「更快」「更便宜」这类没核实的说法。

## 接新服务商（Nano Banana…）要动哪几处

鉴权与服务商是注册表驱动的，加一家不用改设置界面：

1. `lib/models.ts`：加这家模型的常量与参数（尺寸带、token 上限、支持哪些开关）。
2. `lib/providers.ts` 的 `PROVIDERS`：加一条 descriptor —— 密钥的请求头/环境变量名、专属字段（区域、业务空间 ID 这类，含 `requiredWhen`）、文档链接、本站代理路径、模型清单，以及 `resolveProviderBaseUrl` 里那几行拼地址的逻辑。
3. 写一个 `lib/<provider>-server.ts` 代理（照 `lib/qwen-server.ts`：`resolveApiKey` → 转发 → 把临时链接转成 Data-URL），加 `app/api/<provider>/generation` 路由。
4. 写一个把 `StudioParams` 翻译成该家请求体的 builder，并在 `validateStudioParams` 里补它专属的约束。

设置界面按 descriptor 自动长出小节（密钥 + 各家专属字段 + 测试连通 + 状态），模型下拉按服务商分组，浏览器配置存在 localStorage 的 `image-skill-studio.providers` 一个键下。

## 常见问题

**为什么有的 Skill 里写着 Python 脚本、macOS 导入器？** 那些原文本来就是写给 agent 的工作流（例如 Live Flow 要求打包实况照片 ZIP 并交给导入器）。全文直发意味着这些句子也会进图像模型的提示词。卡片上标了 `executionNote`，你可以先看清再决定用不用。

**提示词润色要不要开？** 建议**关**。`prompt_extend=true` 会先让模型改写你的提示词，而 SKILL 原文的价值就在措辞本身；关掉才完全按原文出图。

**图片链接过期打不开？** 不会。代理已把上游临时链接转成 Data-URL 存进 IndexedDB。

**历史记录存哪里？** 浏览器 IndexedDB，换浏览器或清站点数据会没。

**密钥会被本站存起来吗？** 不会。BYOK：每个服务商的密钥与参数存你自己的浏览器 localStorage（单键 `image-skill-studio.providers`），请求时按 descriptor 声明的头名（百炼是 `x-qwen-key` / `x-qwen-region` / `x-qwen-workspace`）发给本站代理，代理只把它放进 `Authorization` 并拼出上游主机名转发，服务端不落盘、不记日志。不放心就本地自托管。

**「测试连通」会不会花钱？** 不会。它故意发一条空提示词请求：上游回 `InvalidParameter` 说明鉴权已过（不出图），回 `InvalidApiKey`/401 就是密钥或区域不对。

## 许可

- 本仓库应用代码：AGPL-3.0，全文见 [LICENSE](LICENSE)。
- `skills/` 下的 SKILL 原文与素材：各自作者的**个人非商业许可**，不随本仓库采用 AGPL。作者、来源、许可原文见 **[NOTICE.md](NOTICE.md)**。
