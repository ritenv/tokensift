import { defineRule } from "../rule.js";
import { findUniformObjectArrays } from "../services/data-rows.js";
import type { Finding } from "../types.js";

const MIN_AVG_KEY_LEN = 6;

const WHY =
  "descriptive keys like customer_lifetime_value_usd are re-paid on every row in bulk data; a short key plus a one-time legend is cheaper once there are enough rows";

function shortKeyFor(index: number): string {
  return index < 26 ? String.fromCharCode(97 + index) : `k${index}`;
}

export const longKeys = defineRule({
  id: "long-keys",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const { region, rows, keys } of findUniformObjectArrays(ctx.jsonRegions)) {
      const avgKeyLen = keys.reduce((sum, k) => sum + k.length, 0) / keys.length;
      if (avgKeyLen < MIN_AVG_KEY_LEN) continue;

      const current = ctx.encoder.countTokens(JSON.stringify(region.value));

      const shortKeyMap = Object.fromEntries(keys.map((k, i) => [k, shortKeyFor(i)]));
      const legend = JSON.stringify(shortKeyMap);
      const remapped = rows.map((row) =>
        Object.fromEntries(keys.map((k) => [shortKeyMap[k], row[k]])),
      );
      const afterFix =
        ctx.encoder.countTokens(legend) + ctx.encoder.countTokens(JSON.stringify(remapped));
      if (afterFix >= current) continue;

      const [start, end] = region.range;
      findings.push({
        ruleId: "long-keys",
        severity,
        message: `${rows.length} rows with long keys cost ${current} tokens; short keys plus a legend cost ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion: "ship a short-key legend once, and remap rows to the short keys",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
