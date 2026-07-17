import { defineRule } from "../rule.js";
import { findUniformObjectArrays } from "../services/data-rows.js";
import type { Finding } from "../types.js";

const MIN_PREFIX_LEN = 4;

const WHY =
  "enum-style values with a repeated prefix (STATUS_ACTIVE, STATUS_INACTIVE) pay for that prefix on every row; the prefix only needs to be said once";

function longestCommonPrefix(values: string[]): string {
  let prefix = values[0]!;
  for (const value of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

export const verboseSchemaValues = defineRule({
  id: "verbose-schema-values",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const { region, rows, keys } of findUniformObjectArrays(ctx.jsonRegions)) {
      for (const key of keys) {
        const values = rows.map((row) => row[key]);
        if (!values.every((v): v is string => typeof v === "string")) continue;
        if (new Set(values).size < 2) continue;

        const prefix = longestCommonPrefix(values);
        if (prefix.length < MIN_PREFIX_LEN) continue;

        const current = values.reduce(
          (sum, v) => sum + ctx.encoder.countTokens(JSON.stringify(v)),
          0,
        );
        const afterFix =
          ctx.encoder.countTokens(JSON.stringify(prefix)) +
          values.reduce(
            (sum, v) => sum + ctx.encoder.countTokens(JSON.stringify(v.slice(prefix.length))),
            0,
          );
        if (afterFix >= current) continue;

        const [start, end] = region.range;
        findings.push({
          ruleId: "verbose-schema-values",
          severity,
          message: `values for "${key}" share the prefix '${prefix}' across ${rows.length} rows, costing ${current} tokens; stripping it costs ${afterFix}`,
          why: WHY,
          loc: { input: ctx.inputRef, range: [start, end] },
          tokens: { current, afterFix, saved: current - afterFix },
          suggestion: `state the '${prefix}' prefix once and use the suffix only in each row`,
          confidence: ctx.encoder.mode,
        });
      }
    }

    return findings;
  },
});
