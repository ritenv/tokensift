import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const WHY =
  "hex-with-dashes has no merges in BPE vocabularies, so UUIDs tokenize close to 1 token per 1-2 characters";

export const uuidBloat = defineRule({
  id: "uuid-bloat",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    let n = 0;

    for (const match of ctx.text.matchAll(UUID)) {
      const uuid = match[0];
      const start = match.index;
      n += 1;

      const current = ctx.encoder.countTokens(uuid);
      const replacement = `id-${n}`;
      const afterFix = ctx.encoder.countTokens(replacement);

      findings.push({
        ruleId: "uuid-bloat",
        severity,
        message: `UUID '${uuid}' costs ${current} tokens (${(uuid.length / current).toFixed(1)} chars/token)`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + uuid.length] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion: `map '${uuid}' to a short id like '${replacement}' before prompting, and restore it in your own code after the response`,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
