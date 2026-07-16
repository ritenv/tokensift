import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const NORMALIZE: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "—": "--",
  "–": "-",
  " ": " ",
  "​": "",
  "…": "...",
};

const PATTERN = new RegExp(`[${Object.keys(NORMALIZE).join("")}]`, "g");

const WHY =
  "smart quotes, em-dashes, NBSP and zero-width chars often cost more per glyph than their ASCII equivalents, and slip in unnoticed via copy-paste";

const SUGGESTION = "normalize to the ASCII equivalent";

export const unicodePunct = defineRule({
  id: "unicode-punct",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const match of ctx.text.matchAll(PATTERN)) {
      const char = match[0]!;
      const start = match.index;
      const replacement = NORMALIZE[char]!;

      const current = ctx.encoder.countTokens(char);
      const afterFix = replacement ? ctx.encoder.countTokens(replacement) : 0;

      findings.push({
        ruleId: "unicode-punct",
        severity,
        message: `non-ASCII punctuation '${char}' costs ${current} token(s), ASCII equivalent costs ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + char.length] },
        tokens: { current, afterFix, saved: current - afterFix },
        fix: {
          description: `normalize '${char}' to '${replacement}'`,
          range: [start, start + char.length],
          replacement,
        },
        suggestion: SUGGESTION,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
