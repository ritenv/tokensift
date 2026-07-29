import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const REFERS_ABOVE =
  /\b(?:as shown|as described|in the (?:format|schema|json|example)s?|per the)\s+above\b/gi;
const REFERS_BELOW =
  /\b(?:as shown|as described|in the (?:format|schema|json|example)s?|per the)\s+below\b/gi;
const REFERS_EXAMPLES = /\b(?:the|these|those)\s+examples?\s+(?:above|below|provided)\b/gi;

const CODE_FENCE = /```/;

// Checking the whole document for "does *something* structurally JSON- or fence-shaped
// exist anywhere" (rather than plausibly near this specific reference) meant any JSON block
// or code fence anywhere in a long prompt silently defeated detection everywhere else in it,
// same for any other unrelated use of the word "example". A proximity window keeps this rule
// cheap and conservative (still no real reference resolution) while no longer being fooled by
// content far away that the instruction can't plausibly be pointing at.
const PROXIMITY_WINDOW = 300;

const WHY =
  "an instruction that points at a structure ('as shown above', 'the examples below') costs tokens and confuses the model when that structure doesn't actually exist, usually a template-assembly bug";

function hasStructureBefore(
  ctx: { text: string; jsonRegions: { range: [number, number] }[] },
  index: number,
): boolean {
  const windowStart = Math.max(0, index - PROXIMITY_WINDOW);
  if (ctx.jsonRegions.some((r) => r.range[1] <= index && r.range[1] > windowStart)) return true;
  return CODE_FENCE.test(ctx.text.slice(windowStart, index));
}

function hasStructureAfter(
  ctx: { text: string; jsonRegions: { range: [number, number] }[] },
  index: number,
): boolean {
  const windowEnd = Math.min(ctx.text.length, index + PROXIMITY_WINDOW);
  if (ctx.jsonRegions.some((r) => r.range[0] >= index && r.range[0] < windowEnd)) return true;
  return CODE_FENCE.test(ctx.text.slice(index, windowEnd));
}

function countOtherExampleMentions(text: string, start: number, end: number): number {
  const windowStart = Math.max(0, start - PROXIMITY_WINDOW);
  const windowEnd = Math.min(text.length, end + PROXIMITY_WINDOW);
  const before = text.slice(windowStart, start);
  const after = text.slice(end, windowEnd);
  const matches =
    (before.match(/\bexamples?\b/gi)?.length ?? 0) + (after.match(/\bexamples?\b/gi)?.length ?? 0);
  return matches;
}

export const deadInstruction = defineRule({
  id: "dead-instruction",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    function report(match: RegExpMatchArray, reason: string) {
      const start = match.index!;
      const end = start + match[0].length;
      const current = ctx.encoder.countTokens(match[0]);
      findings.push({
        ruleId: "dead-instruction",
        severity,
        message: `"${match[0]}" references ${reason} that isn't actually in this prompt`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix: 0, saved: current },
        suggestion: "remove the dangling reference or add the structure it points to",
        confidence: ctx.encoder.mode,
      });
    }

    for (const match of ctx.text.matchAll(REFERS_ABOVE)) {
      if (!hasStructureBefore(ctx, match.index!)) report(match, "a structure above it");
    }
    for (const match of ctx.text.matchAll(REFERS_BELOW)) {
      if (!hasStructureAfter(ctx, match.index! + match[0].length))
        report(match, "a structure below it");
    }
    for (const match of ctx.text.matchAll(REFERS_EXAMPLES)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (countOtherExampleMentions(ctx.text, start, end) === 0)
        report(match, "examples that aren't present");
    }

    return findings;
  },
});
