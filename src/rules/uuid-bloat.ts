import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

// lookaround instead of \b: \b treats "_" as a word char, so "trace_<uuid>_end" wouldn't match
const UUID =
  /(?<![0-9a-fA-F])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-fA-F])/gi;

const WHY =
  "hex-with-dashes has no merges in BPE vocabularies, so UUIDs tokenize close to 1 token per 1-2 characters";

export const uuidBloat = defineRule({
  id: "uuid-bloat",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    // same UUID gets the same short id every time, so log/trace correlation stays intact
    const shortIdByUuid = new Map<string, string>();

    for (const match of ctx.text.matchAll(UUID)) {
      const uuid = match[0];
      const start = match.index;

      let replacement = shortIdByUuid.get(uuid);
      if (!replacement) {
        replacement = `id-${shortIdByUuid.size + 1}`;
        shortIdByUuid.set(uuid, replacement);
      }

      const current = ctx.encoder.countTokens(uuid);
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
