import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

// lookaround instead of \b: \b treats "_" as a word char, so "trace_<uuid>_end" wouldn't match
const UUID =
  /(?<![0-9a-fA-F])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-fA-F])/gi;

// Crockford base32 (no I, L, O, U), fixed 26 chars, same boundary trick as UUID above.
const ULID = /(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/gi;

const WHY =
  "hex-with-dashes and base32 ids have no merges in BPE vocabularies, so UUIDs and ULIDs tokenize close to 1 token per 1-2 characters";

function findIds(text: string): { id: string; start: number; kind: "UUID" | "ULID" }[] {
  const matches: { id: string; start: number; kind: "UUID" | "ULID" }[] = [];
  for (const match of text.matchAll(UUID)) {
    matches.push({ id: match[0], start: match.index, kind: "UUID" });
  }
  // a run of letters with no digit at all is more likely a word than an id
  for (const match of text.matchAll(ULID)) {
    if (/[0-9]/.test(match[0])) matches.push({ id: match[0], start: match.index, kind: "ULID" });
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

export const uuidBloat = defineRule({
  id: "uuid-bloat",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    // same id gets the same short id every time, so log/trace correlation stays intact
    const shortIdById = new Map<string, string>();

    for (const { id, start, kind } of findIds(ctx.text)) {
      let replacement = shortIdById.get(id);
      if (!replacement) {
        replacement = `id-${shortIdById.size + 1}`;
        shortIdById.set(id, replacement);
      }

      const current = ctx.encoder.countTokens(id);
      const afterFix = ctx.encoder.countTokens(replacement);

      findings.push({
        ruleId: "uuid-bloat",
        severity,
        message: `${kind} '${id}' costs ${current} tokens (${(id.length / current).toFixed(1)} chars/token)`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + id.length] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion: `map '${id}' to a short id like '${replacement}' before prompting, and restore it in your own code after the response`,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
