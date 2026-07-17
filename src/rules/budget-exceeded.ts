import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const WHY =
  "a declared token budget exists to keep cost and latency predictable; this input broke it";

export const budgetExceeded = defineRule({
  id: "budget-exceeded",
  defaultSeverity: "error",
  why: WHY,
  check(ctx, severity) {
    if (ctx.budget === undefined) return [];

    const current = ctx.tokenView.count;
    if (current <= ctx.budget) return [];

    return [
      {
        ruleId: "budget-exceeded",
        severity,
        message: `input uses ${current} tokens, over the declared budget of ${ctx.budget}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [0, ctx.text.length] },
        tokens: { current, afterFix: ctx.budget, saved: current - ctx.budget },
        suggestion:
          "trim static content, or move more of the prompt into dyn() slots with a tighter sample",
        confidence: ctx.encoder.mode,
      },
    ];
  },
});
