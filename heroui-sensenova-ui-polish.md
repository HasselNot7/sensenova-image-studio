# UI 美化提示词：SenseNova 图像创作工作台（精致浅色风 · 仅视觉换皮）

本文件是**纯视觉升级任务**的需求规格。现有应用（Next.js App Router + HeroUI v3 + Tailwind v4）功能与布局已完成，界面截图见对话上下文。执行前先通读本文件，所有约束都是硬性的。

## 0. 铁律：只换皮，不动结构

- **禁止**改动：路由、组件层级与 DOM 顺序、三栏布局（左参数卡 / 中结果卡 / 右历史记录）、顶部 Header 与 Tabs 的位置、所有状态管理、API 调用逻辑、表单校验逻辑、localStorage 结构。
- **禁止**增删功能、改文案语义（可微调措辞排版但信息不变）。
- 允许改动：className、Tailwind 主题变量、globals.css、组件的视觉 props（size/variant/radius 类）、阴影/边框/圆角/配色/字体/间距/动效。
- 验收方式：改动前后页面截图像素级对齐（同一视口宽度），任何元素不得移位超过 2px。

## 1. 设计基调

「精致浅色风」：干净冷灰底 + 纯白卡面 + SenseNova 品牌蓝渐变点缀 + 三层柔和阴影 + 细腻动效。参考质感：Linear / Vercel / Stripe Dashboard 的浅色模式，克制、专业、有呼吸感。**不做深色为主的设计**（现有暗色切换保留可用即可，不作为验收基准）。

## 2. 设计令牌（写入 Tailwind v4 `@theme` / globals.css，禁止在 JSX 散落硬编码色值）

```css
/* 背景与表面 */
--bg-page: #f5f7fb;          /* 页面冷灰底（替换当前纯灰） */
--bg-surface: #ffffff;       /* 卡片面 */
--bg-subtle: #f8fafc;        /* 次级面：开关行、空态区、历史缩略底 */
--bg-inset: #eef2f7;         /* 输入轨道、Tab track */

/* 文本 */
--text-primary: #0f172a;
--text-secondary: #475569;
--text-muted: #94a3b8;       /* 辅助说明文字统一此色 12px */

/* 描边 */
--border-default: #e5eaf2;
--border-strong: #d7dee9;

/* 品牌 */
--brand: #1177e4;                                   /* SenseNova 官方蓝 */
--brand-gradient: linear-gradient(135deg, #2f7ef7 0%, #6a5cff 100%);
--brand-ring: rgba(47, 126, 247, 0.35);             /* focus ring */

/* 语义色 */
--success: #16a34a;
--warning-bg: #fef3c7; --warning-text: #b45309;     /* 「API 密钥：未配置」徽章 */
--danger: #dc2626;

/* 圆角 */
--radius-card: 16px;   /* 三大卡片、Modal */
--radius-control: 10px;/* 输入框、Select、Textarea */
--radius-pill: 9999px; /* Tabs、徽章、主按钮保持 pill 或 12px */

/* 三层阴影（统一 rgb(15 23 42 / x) 冷调，禁止纯黑阴影） */
--shadow-1: 0 1px 2px rgb(15 23 42 / 0.04);
--shadow-2: 0 1px 3px rgb(15 23 42 / 0.05), 0 8px 24px -8px rgb(15 23 42 / 0.10);
--shadow-3: 0 2px 4px rgb(15 23 42 / 0.04), 0 16px 40px -12px rgb(37 99 235 / 0.18); /* hover/弹层 */

/* 动效 */
--ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
--dur-fast: 150ms; --dur-base: 220ms;
```

HeroUI v3 的组件色（accent 等）通过其官方 CSS 变量覆盖方式对齐 `--brand`，先查 https://heroui.com/docs/react/getting-started/theming 再改，**禁止 `!important` 硬覆盖**。

## 3. 字体与排版

- 字体栈：`"MiSans", "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`（不引网络字体，本地优先）。
- 字号阶梯：页面标题 18/600；卡片标题 15/600；正文与控件 14/400；辅助说明 12/400（行高 1.6，颜色 `--text-muted`）。
- 参数标签（模型、提示词 prompt、尺寸 size…）统一 13/500 `--text-secondary`，与控件间距 6px，与上一组间距 20px（用固定 rhythm，不随意留白）。
- 所有辅助说明文字（"轻量模型：支持全量参数…"等）统一样式，不抢主体。

## 4. 逐区域换皮要求（位置不变）

### 4.1 Header
- sticky + `backdrop-blur-md` + 半透明白底（`rgb(255 255 255 / 0.8)`）+ 1px `--border-default` 下边框。
- Logo 方块改为 `--brand-gradient` 底 + 白色星形图标 + `--radius-control` + `--shadow-2`。
- 副标题一行小字改 `--text-muted` 12px；「API 密钥：未配置」徽章改 warning 配色（琥珀底/棕字/pill），配置成功后应变绿色 success 态（若现有逻辑支持文案切换，仅换色）。
- 主题切换按钮：ghost 圆形 32px，hover `--bg-inset`。

### 4.2 Tabs（文生图 / 图片编辑）
- 改为 segmented control：track 用 `--bg-inset` 圆角 pill + 内嵌 1px 边框；选中项白底 + `--shadow-1` + 文字 `--text-primary` 600，未选中 `--text-secondary`。
- 切换时选中块 220ms `--ease-out-soft` 滑动（HeroUI Tabs 自带 indicator 则调其样式即可）。
- 图标随状态变色：选中项图标用 `--brand`。

### 4.3 左侧参数卡
- 卡面：白底、1px `--border-default`、`--radius-card`、`--shadow-2`、内边距 24px。
- Textarea / Select / Input：`--radius-control`、底色 `--bg-surface`、边框 `--border-strong`；focus 态：边框 `--brand` + 2px `--brand-ring` 外圈，150ms 过渡。
- 「水印」「提示词润色」两个开关行：各自放进 `--bg-subtle` + `--radius-control` + padding 12px 的小块中（仅加背景块，不改位置）。
- 「当前 0 字符；留空不可提交」：右对齐 12px `--text-muted`；prompt 超限时转 `--danger`（若已有校验，仅上色）。
- 主按钮「开始生成」：`--brand-gradient` 底、白字、pill、`--shadow-2`；hover 上浮 `translateY(-1px)` + `--shadow-3`；active 回落；loading 时保留 spinner，禁止宽度跳动。
- 「数量 n = 1（官方限制）」说明文字并入按钮行时保持原位，只调颜色字号。

### 4.4 中间结果卡
- 空态：虚线边框改 1px `--border-default` 实线 + `--bg-subtle` 底；中心图标放进 64px 渐变淡蓝圆形容器（`linear-gradient(180deg, #eaf2ff, #f6f9ff)` + 品牌蓝图标）；文案 13px `--text-muted` 居中。
- 生成中：Skeleton 用微光 shimmer 动画（`--bg-inset` 基色）。
- 出图后：图片 `--radius-control` 圆角、1px 边框、`--shadow-2`，250ms 淡入（opacity + scale(0.98→1)）；hover 显示操作浮层（下载等，若已有按钮则只调样式）。

### 4.5 右侧历史记录
- 「历史记录 0 条」标题行：图标 + 15/600，计数用 pill 徽章（`--bg-inset` 底 12px）。
- 空态文案居中、12px `--text-muted`、行高 1.7。
- 有记录时：每条为 56px 缩略图（圆角 8px、1px 边框、`--bg-subtle` 底）+ prompt 单行截断 + 时间 12px；hover 整行 `--bg-subtle` + 右侧浮现删除图标按钮；条目间 8px 间距。

### 4.6 全局细节
- Toast：圆角 12px、`--shadow-3`、左侧 3px 语义色条。
- 滚动条（历史记录区）：细滚动条样式（8px 轨道、`--border-strong` 滑块、hover 加深）。
- 页面底 `--bg-page`；三栏卡片顶部对齐。

## 5. 动效规范（克制）

- 全部过渡只用 `--dur-fast/--dur-base` + `--ease-out-soft`；不做入场编排动画、不做视差。
- hover 反馈仅限：按钮上浮、卡片阴影升一级（`--shadow-2 → --shadow-3`）、历史行背景。
- 必须支持 `@media (prefers-reduced-motion: reduce)` 下关闭位移与淡入。

## 6. 验收标准

1. `npm run build` 通过；无新增运行时依赖（动效纯 CSS）。
2. 与改动前对比截图：布局零位移，仅视觉变化。
3. 所有色值来自第 2 节令牌，全局搜索 JSX 无散落 hex/`bg-blue-500` 之类硬编码。
4. 键盘 Tab 焦点环全部可见且统一（`--brand-ring`）。
5. 亮色主题为验收基准；暗色模式不报错、可阅读即可。
6. 功能回归：三个接口调用、校验、历史读写、下载全部行为不变。

## 7. 禁止事项

- 禁止改布局结构、组件顺序、栅格列数。
- 禁止引入新 UI 库 / 动画库 / 图标库（沿用现有 HeroUI + 已有图标）。
- 禁止 `!important`、禁止内联 style 写颜色、禁止大段自定义 CSS 覆盖 HeroUI（优先其官方 theme 变量与 props）。
- 禁止改任何接口参数、文案信息量与业务逻辑。
