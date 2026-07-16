import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g;

const WHY =
  "long digit runs split into 1-3 digit tokens each; a full ISO-8601 timestamp tokenizes far worse than the epoch seconds it represents";

export const digitFragmentation = defineRule({
  id: "digit-fragmentation",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const match of ctx.text.matchAll(ISO_TIMESTAMP)) {
      const timestamp = match[0];
      const ms = Date.parse(timestamp);
      if (Number.isNaN(ms)) continue;
      const start = match.index;

      const epoch = String(Math.floor(ms / 1000));
      const current = ctx.encoder.countTokens(timestamp);
      const afterFix = ctx.encoder.countTokens(epoch);
      if (afterFix >= current) continue;

      findings.push({
        ruleId: "digit-fragmentation",
        severity,
        message: `timestamp '${timestamp}' costs ${current} tokens, epoch seconds ('${epoch}') costs ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + timestamp.length] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion:
          "store and pass epoch seconds; format as a human-readable date only where it's displayed",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
