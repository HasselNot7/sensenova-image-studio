# SenseNova 图像创作工作台

SenseNova 图像模型非官方网页客户端，填提示词出图、传图改图。
[在线使用](http://47.120.70.80:8080/)
![文生图空态](docs/screenshots/01-generate-empty.png)

## 能做什么

- 两个模型，走 SenseNova 的图像接口：
  - `sensenova-u1-fast`：只能文生图，尺寸是固定的 11 个常量里选，返回的图片链接 1 小时过期。
  - `sensenova-u1.5-lite`：文生图 + 图片编辑，尺寸（预设或自定义）、图片格式、返回方式、提示词润色都能调。

![填好提示词和参数](docs/screenshots/02-generate-form.png)

## 快速开始

前置：Node 18 以上；一个 SenseNova 平台账号（密钥在 platform.sensenova.cn 控制台创建）。

1. 安装依赖、启动服务：

   ```bash
   npm install
   npm run dev
   ```

2. 打开 http://localhost:3000 ，点右上角「API 密钥」，填入你自己的 `sk-` 密钥并保存。
   密钥存在你浏览器本地，之后生成/编辑都用它。没填就点生成，会提示并自动弹出设置。

校验：

```bash
npm run build   # 生产构建 + 类型检查
npm run test    # 三个请求体的契约断言
```

## 部署（自托管给别人用）

生产构建后用 Next 自带服务：

```bash
npm run build
npm run start        # 默认 3000，可用 PORT=xxxx 改
```
- 可选：想省掉「每人各填一次」，在服务器配 `.env.local` 的 `SENSENOVA_API_KEY` 作为单用户回退（见 `.env.example`）。但那样所有访客共用你这一个 key，只适合自己或内网小圈子。

![图片编辑](docs/screenshots/03-edit-tab.png)

## 常见问题

**图片链接过期打不开怎么办？**
应用不靠那条临时链接。代理在服务端把图下载下来转成 Data-URL 再返回，历史里存的就是 Data-URL，24 小时后照样能看。

**水印和 prompt_extend 是干什么的？**
`watermark` 是官方 Logo 水印，默认开，关掉在公测期免费。`prompt_extend` 让模型先把你的提示词扩写润色再生图，关掉就完全按你写的来。`sensenova-u1-fast` 没有 `output_format` / `response_format` / `prompt_extend` 这几个参数，只有 `watermark` 是两边都显式发的。

**历史记录存在哪里？**
浏览器 IndexedDB（不是 localStorage，容量放得下原图）。每条存原图和一张 256px 缩略图，列表只读缩略图，点开才载原图。换浏览器或清站点数据会没。

**密钥会不会被本站存起来？**
不会。BYOK：密钥存在你自己的浏览器 localStorage，请求时以 `x-sensenova-key` 头发给本站代理，代理只把它加到 `Authorization` 转发给 SenseNova，服务端不落盘、不记日志。不放心就本地自托管。（服务器端也可配 `SENSENOVA_API_KEY` 作为单用户回退，见 `.env.example`。）

![设置 · API 密钥](docs/screenshots/04-settings-modal.png)

## 接口契约（改代码前先看）

- `n` 只支持 1。
- `sensenova-u1-fast` 的 size 只能从 11 个常量里选，不接受自定义宽高。
- `sensenova-u1.5-lite` 自定义 size：宽高是 32 的倍数、范围 512~4096、比例最大 3:1。
- 编辑接口的 `image_url` 只接受完整 http/https 链接，或带 `data:image/*;base64,` 前缀的 Data-URL。

## License

AGPL-3.0，全文见 [LICENSE](LICENSE)。
