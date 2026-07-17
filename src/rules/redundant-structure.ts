import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const WHY =
  "the same data serialized twice still costs tokens twice, even if one copy is reformatted (pretty vs minified, reordered keys); repeated-block only catches byte-identical repeats";

export const redundantStructure = defineRule({
  id: "redundant-structure",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    const seen = new Map<string, number>();

    for (const region of ctx.jsonRegions) {
      const signature = JSON.stringify(region.value);
      const firstIndex = seen.get(signature);
      if (firstIndex === undefined) {
        seen.set(signature, region.range[0]);
        continue;
      }

      const current = ctx.encoder.countTokens(region.text);
      const [start, end] = region.range;
      findings.push({
        ruleId: "redundant-structure",
        severity,
        message: `this JSON blob is a duplicate of the one at offset ${firstIndex}, costing ${current} extra tokens`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix: 0, saved: current },
        suggestion: "include the data once and refer back to it instead of repeating the blob",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
