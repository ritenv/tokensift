import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const WHY =
  "the same data serialized twice still costs tokens twice, even if one copy is reformatted (pretty vs minified, reordered keys); repeated-block only catches byte-identical repeats";

// JSON.stringify preserves whatever key order the value happened to be parsed in, so two
// objects with identical data but differently-ordered keys produce different strings and
// were never recognized as duplicates -- directly contradicting this rule's own "reordered
// keys" claim above. Sorting object keys recursively (array order stays as-is, since array
// order is usually semantically meaningful) makes the signature order-independent.
function canonicalSignature(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSignature).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalSignature((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export const redundantStructure = defineRule({
  id: "redundant-structure",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    const seen = new Map<string, number>();

    for (const region of ctx.jsonRegions) {
      const signature = canonicalSignature(region.value);
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
