/** Skill 资产的数据形状：`skills/<id>/skill.json` + `scripts/build-skills.ts` 生成 `lib/skills.generated.ts`。 */

export type SkillMode = "t2i" | "i2i";

export interface SkillPromptPartStat {
  path: string;
  bytes: number;
}

export interface SkillBundledImage {
  /** 相对 skill 目录的原始路径（入库位置） */
  file: string;
  /** 生成后可访问的站点路径 */
  src: string;
  label: string;
  note?: string;
}

export interface SkillStats {
  chars: number;
  cjkChars: number;
  tokens: number;
  parts: SkillPromptPartStat[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  nameEn: string;
  shortDescription: string;
  author: string;
  source: string;
  license: string;
  licenseFile?: string;
  mode: SkillMode;
  inputImages: { min: number; max: number };
  promptParts: string[];
  bundledImages?: SkillBundledImage[];
  /** 只执行到出图时的落差说明，原文里还要求做的事在这里交代 */
  executionNote?: string;
  userNotePlaceholder?: string;
  tags: string[];
  /** 实际发给模型的正文：promptParts 按序拼接的结果 */
  body: string;
  stats: SkillStats;
  /** 内置预蒸馏正文（skills/<id>/distilled.md），原文超限时可直发，省一次在线蒸馏 */
  distilledBody?: string;
  distilledStats?: { chars: number; cjkChars: number; tokens: number };
  /** 极简版正文（skills/<id>/minimal.md）：连精简版都放不进的模型（SenseNova u1.5 系按字符计）用它免蒸馏 */
  minimalBody?: string;
  minimalStats?: { chars: number; cjkChars: number; tokens: number };
}
