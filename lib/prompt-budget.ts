/**
 * 提示词预算估算。
 *
 * 上游给的是 token 上限（Qwen Image 3.0 建议 4500 token），浏览器侧拿不到真分词器，
 * 所以这里只是一个刻意保守的可复算估算：中日韩字符按 1 token/字，其余按 4 字符/token。
 * 界面必须把它标成「估算」，并始终以「超出会被上游截断或报错」的措辞出现。
 */

export const CJK_TOKENS_PER_CHAR = 1;
export const LATIN_CHARS_PER_TOKEN = 4;

const CJK_RE =
  /[㐀-䶿一-鿿豈-﫿　-〿＀-￯]/g;

export interface TextBudget {
  chars: number;
  cjkChars: number;
  otherChars: number;
  tokens: number;
}

export function measureTextBudget(text: string): TextBudget {
  const cjkMatches = text.match(CJK_RE);
  const cjkChars = cjkMatches ? cjkMatches.length : 0;
  const otherChars = text.length - cjkChars;
  const tokens = Math.ceil(cjkChars * CJK_TOKENS_PER_CHAR + otherChars / LATIN_CHARS_PER_TOKEN);
  return { chars: text.length, cjkChars, otherChars, tokens };
}

/**
 * 按模型声明的口径对比预算。上限单位不全是 token：SenseNova u1.5 系按字符
 * （上游报错原文 "should not exceed 5000 characters"），token 估算对英文文本
 * 会低估 4 倍，必须拿 chars 对比才不漏报。
 */
export function exceedsPromptBudget(
  budget: TextBudget,
  limit: number,
  unit: "tokens" | "chars",
): boolean {
  return (unit === "chars" ? budget.chars : budget.tokens) > limit;
}
