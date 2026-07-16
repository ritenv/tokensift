import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const TRAILING = /[ \t]+(?=\n|$)/g;
const MID_LINE_RUN = /(?<=\S)[ \t]{2,}(?!\n|$)/g;
const BLANK_LINES = /\n{3,}/g;

const WHY =
  "runs of spaces and blank lines are real tokens, not free formatting; trailing whitespace costs the same as visible characters";

const SUGGESTION = "collapse the run";

function collect(text: string, pattern: RegExp, replacement: (match: string) => string) {
  const hits: { start: number; end: number; replacement: string }[] = [];
  for (const match of text.matchAll(pattern)) {
    hits.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement: replacement(match[0]),
    });
  }
  return hits;
}

export const whitespaceRun = defineRule({
  id: "whitespace-run",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    const hits = [
      ...collect(ctx.text, TRAILING, () => ""),
      ...collect(ctx.text, MID_LINE_RUN, () => " "),
      ...collect(ctx.text, BLANK_LINES, () => "\n\n"),
    ].sort((a, b) => a.start - b.start);

    for (const hit of hits) {
      const run = ctx.text.slice(hit.start, hit.end);
      const current = ctx.encoder.countTokens(run);
      const afterFix = hit.replacement ? ctx.encoder.countTokens(hit.replacement) : 0;
      if (current <= afterFix) continue;

      findings.push({
        ruleId: "whitespace-run",
        severity,
        message: `whitespace run costs ${current} token(s), collapses to ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [hit.start, hit.end] },
        tokens: { current, afterFix, saved: current - afterFix },
        fix: ctx.autofix
          ? {
              description: "collapse whitespace run",
              range: [hit.start, hit.end],
              replacement: hit.replacement,
            }
          : undefined,
        suggestion: SUGGESTION,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
