import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const WHY =
  "indented JSON spends tokens on newlines and leading spaces at every nesting level; the model doesn't need pretty-printing to parse structured data";

const SUGGESTION = "minify the JSON region";

export const prettyJson = defineRule({
  id: "pretty-json",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const region of ctx.jsonRegions) {
      const minified = JSON.stringify(region.value);
      if (minified === region.text) continue;

      const current = ctx.encoder.countTokens(region.text);
      const afterFix = ctx.encoder.countTokens(minified);
      if (current <= afterFix) continue;

      const [start, end] = region.range;
      findings.push({
        ruleId: "pretty-json",
        severity,
        message: `pretty-printed JSON costs ${current} tokens, minified costs ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix, saved: current - afterFix },
        fix: ctx.autofix
          ? {
              description: "minify JSON region",
              range: [start, end],
              replacement: minified,
            }
          : undefined,
        suggestion: SUGGESTION,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
