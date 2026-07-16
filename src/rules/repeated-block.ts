import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const MIN_TOKENS = 8;

const WHY =
  "verbatim spans repeated across a prompt (boilerplate headers, re-pasted examples) are paid every time they appear; the model doesn't need the repetition to use them";

export const repeatedBlock = defineRule({
  id: "repeated-block",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const span of ctx.repeated.find(MIN_TOKENS)) {
      const lenTokens = ctx.encoder.countTokens(span.text);
      const current = lenTokens * span.occurrences.length;
      const afterFix = lenTokens;
      const [start, end] = span.occurrences[0]!;

      findings.push({
        ruleId: "repeated-block",
        severity,
        message: `a ${lenTokens}-token span repeats ${span.occurrences.length} times, costing ${current} tokens total`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion: "state this block once and refer back to it instead of repasting it",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
