/**
 * 把 skills/<id>/ 的原文装配成 lib/skills.generated.ts。
 *
 * 「SKILL.md 全文直发」是本项目定下的口径：发送正文 = promptParts 按序拼接，
 * 不做蒸馏、不做截断。体积与 token 预算在这里算准，由界面如实标价。
 * 附带图（如莫兰迪的材质参考）拷到 public/skills/，源文件仍在 skills/ 里入库。
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { measureTextBudget } from "../lib/prompt-budget";
import type { SkillBundledImage, SkillDefinition, SkillPromptPartStat } from "../lib/skill-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = join(ROOT, "skills");
const PUBLIC_DIR = join(ROOT, "public", "skills");
const OUT_FILE = join(ROOT, "lib", "skills.generated.ts");

interface RawManifest {
  id: string;
  /** 展示顺序，小的在前；不填排最后 */
  order?: number;
  name: string;
  nameEn: string;
  shortDescription: string;
  author: string;
  source: string;
  license: string;
  licenseFile?: string;
  mode: "t2i" | "i2i";
  inputImages: { min: number; max: number };
  promptParts: string[];
  bundledImages?: { file: string; label: string; note?: string }[];
  executionNote?: string;
  userNotePlaceholder?: string;
  tags: string[];
}

function fail(message: string): never {
  console.error(`[build-skills] ${message}`);
  process.exit(1);
}

function readPart(skillDir: string, id: string, relPath: string): { text: string; bytes: number } {
  const abs = join(skillDir, relPath);
  // 拼出来的路径必须还落在本 skill 目录内，避免 ../ 逃出去读仓库其他文件
  if (!resolve(abs).startsWith(resolve(skillDir) + sep())) {
    fail(`${id} 的 promptPart 越界：${relPath}`);
  }
  try {
    const text = readFileSync(abs, "utf8");
    return { text, bytes: statSync(abs).size };
  } catch {
    return fail(`${id} 缺少 promptPart 文件：${relPath}`);
  }
}

function sep(): string {
  return process.platform === "win32" ? "\\" : "/";
}

/** 可选的内置正文（distilled.md / minimal.md）：读不到就 undefined，读到空文件就报错。 */
function readOptionalBody(
  skillDir: string,
  id: string,
  fileName: string,
): { body: string; stats: NonNullable<SkillDefinition["distilledStats"]> } | undefined {
  const path = join(skillDir, fileName);
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    return undefined;
  }
  const text = readFileSync(path, "utf8").trim();
  if (text.length === 0) {
    fail(`${id}/${fileName} 是空文件，要么删掉要么写内容`);
  }
  const budget = measureTextBudget(text);
  return {
    body: text,
    stats: { chars: budget.chars, cjkChars: budget.cjkChars, tokens: budget.tokens },
  };
}

const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "_licenses")
  .map((entry) => entry.name)
  .sort();

if (dirs.length === 0) {
  fail("skills/ 下没有任何 skill 目录");
}

rmSync(PUBLIC_DIR, { recursive: true, force: true });

const skills: SkillDefinition[] = [];
const orderById = new Map<string, number>();

for (const dirName of dirs) {
  const skillDir = join(SKILLS_DIR, dirName);
  const manifestPath = join(skillDir, "skill.json");
  let manifest: RawManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RawManifest;
  } catch (error) {
    fail(`${dirName}/skill.json 读取失败：${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest.id !== dirName) {
    fail(`${dirName}/skill.json 的 id（${manifest.id}）与目录名不一致`);
  }
  orderById.set(manifest.id, manifest.order ?? 999);

  const parts: SkillPromptPartStat[] = [];
  const chunks: string[] = [];
  for (const relPath of manifest.promptParts) {
    const { text, bytes } = readPart(skillDir, manifest.id, relPath);
    parts.push({ path: relPath, bytes });
    chunks.push(text.trim());
  }
  const body = chunks.join("\n\n---\n\n");
  const budget = measureTextBudget(body);

  // 内置预蒸馏正文：约定俗成放 skills/<id>/distilled.md 与 minimal.md，有就读、量预算；没有就跳过
  const distilled = readOptionalBody(skillDir, manifest.id, "distilled.md");
  const minimal = readOptionalBody(skillDir, manifest.id, "minimal.md");

  let bundledImages: SkillBundledImage[] | undefined;
  if (manifest.bundledImages && manifest.bundledImages.length > 0) {
    bundledImages = manifest.bundledImages.map((image) => {
      const srcAbs = join(skillDir, image.file);
      const destAbs = join(PUBLIC_DIR, manifest.id, image.file);
      if (!resolve(srcAbs).startsWith(resolve(skillDir) + sep())) {
        fail(`${manifest.id} 的 bundledImage 越界：${image.file}`);
      }
      try {
        mkdirSync(dirname(destAbs), { recursive: true });
        copyFileSync(srcAbs, destAbs);
      } catch (error) {
        fail(`${manifest.id} 拷贝附带图失败 ${image.file}：${error instanceof Error ? error.message : String(error)}`);
      }
      return {
        file: image.file,
        src: `/${relative(join(ROOT, "public"), destAbs).split("\\").join("/")}`,
        label: image.label,
        ...(image.note ? { note: image.note } : {}),
      };
    });
  }

  skills.push({
    id: manifest.id,
    name: manifest.name,
    nameEn: manifest.nameEn,
    shortDescription: manifest.shortDescription,
    author: manifest.author,
    source: manifest.source,
    license: manifest.license,
    ...(manifest.licenseFile ? { licenseFile: manifest.licenseFile } : {}),
    mode: manifest.mode,
    inputImages: manifest.inputImages,
    promptParts: manifest.promptParts,
    ...(bundledImages ? { bundledImages } : {}),
    ...(manifest.executionNote ? { executionNote: manifest.executionNote } : {}),
    ...(manifest.userNotePlaceholder ? { userNotePlaceholder: manifest.userNotePlaceholder } : {}),
    tags: manifest.tags,
    body,
    stats: {
      chars: budget.chars,
      cjkChars: budget.cjkChars,
      tokens: budget.tokens,
      parts,
    },
    ...(distilled ? { distilledBody: distilled.body, distilledStats: distilled.stats } : {}),
    ...(minimal ? { minimalBody: minimal.body, minimalStats: minimal.stats } : {}),
  });
}

skills.sort((a, b) => (orderById.get(a.id) ?? 999) - (orderById.get(b.id) ?? 999) || a.id.localeCompare(b.id));

skills.sort(
  (a, b) =>
    (orderById.get(a.id) ?? 999) - (orderById.get(b.id) ?? 999) || a.id.localeCompare(b.id),
);

const banner = `/**
 * 由 scripts/build-skills.ts 生成，请勿手改；要改内容改 skills/ 下的原文或 skill.json。
 * 生成时间 ${new Date().toISOString()} · ${skills.length} 个 Skill
 */
`;

const fileBody = `${banner}
import type { SkillDefinition } from "./skill-types";

export const SKILLS: SkillDefinition[] = ${JSON.stringify(skills, null, 2)};

export function findSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}
`;

writeFileSync(OUT_FILE, fileBody, "utf8");

for (const skill of skills) {
  const distilled = skill.distilledStats
    ? ` / 精简版 ${String(skill.distilledStats.chars).padStart(6)} 字符 ~${String(skill.distilledStats.tokens).padStart(5)} tok`
    : "";
  const minimal = skill.minimalStats
    ? ` / 极简版 ${String(skill.minimalStats.chars).padStart(5)} 字符 ~${String(skill.minimalStats.tokens).padStart(4)} tok`
    : "";
  console.log(
    `[build-skills] ${skill.id.padEnd(40)} ${String(skill.stats.chars).padStart(7)} 字符 / 估算 ${String(skill.stats.tokens).padStart(6)} token / ${skill.promptParts.length} 段` +
      (skill.bundledImages ? ` / ${skill.bundledImages.length} 张附带图` : "") +
      distilled +
      minimal,
  );
}
console.log(`[build-skills] 写出 ${relative(ROOT, OUT_FILE)}`);
