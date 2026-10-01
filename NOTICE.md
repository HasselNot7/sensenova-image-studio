# 第三方 Skill 原文与许可（NOTICE）

本仓库的**应用代码**（`app/`、`components/`、`lib/`、`scripts/`）以 AGPL-3.0 发布，见 [LICENSE](LICENSE)。

`skills/` 目录下的是**第三方作者编写的 SKILL.md 原文**，由 `scripts/build-skills.ts` 原样装配成发给生图模型的正文。它们**不随本仓库采用 AGPL**，各自遵循原文可：

| Skill 目录 | 作者 | 来源仓库 | 许可 |
| --- | --- | --- | --- |
| `photo-abstract-editorial` | ZzzLc0405 | <https://github.com/ZzzLc0405/photo-abstract-editorial> | 个人学习、研究与非商业使用；商业使用（含商业化 AI Agent / Workflow）需向作者取得授权。原文见 `skills/_licenses/photo-abstract-editorial.txt` |
| `scene-distillation-zine-v1-3` | Zeejay0 | <https://github.com/Zeejay0/gathered-scenes-zine-skill> | Gathered Scenes Zine Personal Non-Commercial License v1.0。原文见 `skills/_licenses/gathered-scenes-zine.txt` |
| `scenes-gathered-zine-v1-3` | Zeejay0 | 同上 | 同上 |
| `morandi-cinematic-poster-zeejay` | Zeejay0 | 同上 | 同上；附带素材 `assets/reference-typography-material-v1.png` 同许可 |
| `scenes-gathered-zine-live-flow-v1-0` | Zeejay0 | 同上 | 同上；原文第 3–4 阶段依赖作者仓库里的 Python / Swift 脚本与 macOS 导入器，本仓库**未**收录这些可执行文件 |
| `azhu-pen-wash-travel-sketch-v0-23` | azhu032 | <https://github.com/azhu032/azhu-pen-wash-travel-sketch-v0-23> | MIT License。原文见 `skills/_licenses/azhu-pen-wash-travel-sketch.txt` |
| `gc-minimal-zine-poster` | LiamGvchi | <https://github.com/LiamGvchi/gc-minimal-zine-poster> | MIT License。原文见 `skills/_licenses/gc-minimal-zine-poster.txt` |

各 Skill 目录里的 `distilled.md`（精简版）与 `minimal.md`（极简版）是本仓库为绕开在线蒸馏等待而生成的**原文压缩版**（删写给编程 agent 的流程指令、删 Skill 自身的名称/作者/版本号字样、删上游要求画进画面的固定署名，保留画面决策与禁令），属于上述原文的衍生品，随各自许可一同受限。

关于署名：`skills/` 下的原文与 `skills/_licenses/` 的许可文本一律**未改动**，作者信息在本文件与 Skill 卡片上照常标注。被去掉的只有「画进海报」这一动作——上游原文里的分享致谢行本身就写着 `Never place the notice inside the generated image`，而 `azhu` 原文要求画在画面右下角的固定签名属于该 Skill 的品牌标识，不属于许可要求的署名义务（MIT 只要求保留源码副本里的版权声明）。`原文` 档不改一字，只在末尾追加一条禁令压制这些字样，因此上游那句「必须画上固定签名」仍在正文里、仍可能被模型执行；要彻底去掉请用 `精简版` / `极简版` 或开 `在线蒸馏`。

## 商标与品牌素材

`public/brand/bailian.svg` 与内联组件 `components/brand/bailian-logo.tsx` 是阿里云百炼的官方 wordmark，仅用于在设置界面指代该服务商；商标归其权利人所有。内联时把原文件里 `#0a0a0a` 的字标部分改成 `currentColor`（深色主题下原色几乎不可见），品牌色未改。

`components/brand/openai-logo.tsx` 里的 OpenAI 六瓣结几何取自 **simple-icons** 的 `openai.svg`（CC0 单色重绘），改用 `currentColor` 跟随主题，仅用于在设置界面指代该服务商；OpenAI 商标与其权利人所有。选它是因为 OpenAI 没有可直接自托管的官方单色 SVG 分发。`components/brand/distill-mark.tsx` 是本仓库自绘的蒸馏瓶标记，不指向任何第三方。

## 因此请注意

- 本工作台是**非商业个人用途**的演示。要把这些 Skill 用于任何商业产品、付费服务或客户项目，请先分别联系上面的作者取得授权。
- 生成结果的版权与可用性取决于你使用的照片与上游模型条款；SKILL 原文里也都要求「把上传照片当作唯一内容来源」，请勿用他人作品作为输入。
- 若你只想在自己的部署里换成套源 Skill：删掉 `skills/<id>/` 目录，再放你自己的 `SKILL.md` + `skill.json`，跑 `npm run build:skills` 即可（`skill.json` 的字段见 `lib/skill-types.ts`）。
- 选「无 Skill」出图时本站不发送任何内置 Skill 正文（连一行加工指令都不加），那次出图跟上面这份许可清单无关；生成结果仍只受你所用模型服务的条款约束。
