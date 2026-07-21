import { defineRule } from "../rule.js";

export const TOLERANCE_PCT = 10;

const WHY =
  "a token count creeping up past a recorded baseline usually means an unnoticed prompt or template regression, not a deliberate change";

export const baselineRegression = defineRule({
  id: "baseline-regression",
  defaultSeverity: "error",
  why: WHY,
  check(ctx, severity) {
    if (ctx.baseline === undefined) return [];

    const current = ctx.tokenView.count;
    const threshold = Math.ceil(ctx.baseline * (1 + TOLERANCE_PCT / 100));
    if (current <= threshold) return [];

    const growthPct = (((current - ctx.baseline) / ctx.baseline) * 100).toFixed(1);

    return [
      {
        ruleId: "baseline-regression",
        severity,
        message: `input uses ${current} tokens, up ${growthPct}% from a baseline of ${ctx.baseline} (tolerance is ${TOLERANCE_PCT}%)`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [0, ctx.text.length] },
        tokens: { current, afterFix: ctx.baseline, saved: current - ctx.baseline },
        suggestion:
          "review what changed since the baseline was recorded; re-run with --update-baseline once the growth is intentional",
        confidence: ctx.encoder.mode,
      },
    ];
  },
});
