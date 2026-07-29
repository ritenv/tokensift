import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const MIN_TOKENS = 30;

const WHY =
  "a large embedded JSON region that isn't marked with dyn() gets counted as static cost even when it's really per-request data; that breaks the static/dynamic split and cache-alignment accuracy";

// Full-containment only (region entirely inside one slot) missed a realistic case: a static
// JSON skeleton wrapping one or more dyn()-marked fields, e.g. `{"user_id": ${dyn(...)}}`.
// The region there only partially overlaps the slot, so it used to get flagged as entirely
// unlabeled even though the author correctly wrapped the dynamic part. Any overlap at all is
// treated as "the author already dealt with this region" instead.
function overlapsSlot(range: [number, number], slots: { range: [number, number] }[]): boolean {
  return slots.some((slot) => range[0] < slot.range[1] && slot.range[0] < range[1]);
}

export const unlabeledDynamic = defineRule({
  id: "unlabeled-dynamic",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const region of ctx.jsonRegions) {
      if (overlapsSlot(region.range, ctx.slots)) continue;

      const current = ctx.encoder.countTokens(region.text);
      if (current < MIN_TOKENS) continue;

      const [start, end] = region.range;
      findings.push({
        ruleId: "unlabeled-dynamic",
        severity,
        message: `embedded JSON region (${current} tokens) isn't marked with dyn()`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix: current, saved: 0 },
        suggestion:
          "wrap this region with dyn() so it's tracked as dynamic budget, not static cost",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
