# SenseNova 图像创作工作台

基于 [SenseNova 开放平台](https://platform.sensenova.cn/docs) 的文生图 / 图片编辑工作台。
技术栈：Next.js（App Router）+ React 19 + TypeScript + Tailwind CSS v4 + [HeroUI v3](https://heroui.com)。

## 功能

- **文生图**：可切换 `sensenova-u1-fast`（11 个固定 2K 尺寸）与 `sensenova-u1.5-lite`（全量参数：size 预设/自定义、output_format、response_format、prompt_extend、watermark）
- **图片编辑**（仅 `sensenova-u1.5-lite`）：参考图支持公网 URL 或本地文件上传（自动转 `data:image/*;base64` Data-URL，超大体积提醒）
- **后端代理**：`app/api/sensenova/{generations,edits}/route.ts` 附加 `Authorization` 转发至 `https://token.sensenova.cn/v1`，密钥保存在服务端
- **密钥两种模式**：① 推荐——服务端环境变量 `.env.local`（`SENSENOVA_API_KEY=sk-xxx`），密钥完全不经过浏览器；② 便捷测试——设置面板输入“会话密钥”，仅存服务端内存（不落盘、不回传、重启失效）。注意②会让密钥出现在一次发往本机后端的请求体中，不适合部署到公网环境
- **URL 时效规避**：代理在服务端把上游返回的临时图片链接（u1-fast 1 小时 / u1.5-lite 24 小时）下载转为 Data-URL 后再返回前端，历史记录 24 小时后仍可显示
- **历史记录**：localStorage 保存每次成功生成（prompt、模型、参数、Data-URL、时间），支持回看、下载、删除、清空
- **错误处理**：按官方错误表映射中文提示；429（quota_exceeded_error）自动 1s/2s/4s 指数退避重试最多 3 次；500 提供重试按钮
- 暗色/亮色主题跟随系统（next-themes + HeroUI），桌面双栏 / 移动单栏响应式

## 快速开始

```bash
npm install
# 方式一（推荐）：复制 .env.example 为 .env.local，填入 platform.sensenova.cn 控制台创建的 sk- 密钥
# 方式二（快速测试）：直接 npm run dev 后，在页面右上角「设置」面板输入会话密钥（重启失效）
npm run dev
```

访问 http://localhost:3000 。未配置 `SENSENOVA_API_KEY` 时，界面设置面板与接口会返回明确的配置缺失提示（不会崩溃）。

## 校验

```bash
npm run build   # 生产构建 + 类型检查
npm run test    # 请求体契约断言（三个请求逐字段核对官方参数表）
```

## 接口契约要点（勿改）

- 两个模型都走独立图像接口（`/v1/images/generations`、`/v1/images/edits`），**不是 Chat Completions**
- `watermark` 两模型均显式随请求发送；`n` 仅支持 1
- `sensenova-u1-fast` 没有 `response_format` / `output_format` / `prompt_extend`，代理层会拒绝这些字段
- u1.5-lite 自定义 size：宽高为 32 的倍数、512~4096、最大比例 3:1
- edits 的 `image_url` 仅支持完整公网 http/https 链接或带 `data:image/*;base64,` 前缀的 Data-URL
