import { defineRule } from "../rule.js";
import type { Finding, RepeatedSpan } from "../types.js";

const MIN_TOKENS = 8;

const WHY =
  "verbatim spans repeated across a prompt (boilerplate headers, re-pasted examples) are paid every time they appear; the model doesn't need the repetition to use them";

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function occurrencesOverlap(a: RepeatedSpan, b: RepeatedSpan): boolean {
  return a.occurrences.some((oa) => b.occurrences.some((ob) => rangesOverlap(oa, ob)));
}

// find() can legitimately report several spans for the same underlying
// repeated line: e.g. a 12-token reminder repeats 3 times, but a 14-token
// variant (the same reminder plus a following word that happens to match at
// two of those three positions) also clears the occurrence threshold. Both
// are real per the suffix automaton (see repeated-substring.test.ts's
// "abcabcabc" case), but surfacing both as separate findings reads as three
// unrelated repeats instead of one. Keep only the highest-cost span per
// cluster of overlapping occurrences; find() already sorts by tokenCost
// descending, so a simple greedy "skip if it overlaps something already kept"
// pass is enough.
function dedupeOverlapping(spans: RepeatedSpan[]): RepeatedSpan[] {
  const kept: RepeatedSpan[] = [];
  for (const span of spans) {
    if (!kept.some((k) => occurrencesOverlap(k, span))) kept.push(span);
  }
  return kept;
}

export const repeatedBlock = defineRule({
  id: "repeated-block",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const span of dedupeOverlapping(ctx.repeated.find(MIN_TOKENS))) {
      const lenTokens = ctx.encoder.countTokens(span.text);
      const current = lenTokens * span.occurrences.length;
      const afterFix = lenTokens;
      const [start, end] = span.occurrences[0]!;

      findings.push({
        ruleId: "repeated-block",
        severity,
        message: `a ${lenTokens}-token span repeats ${span.occurrences.length} times, costing ${current} tokens total`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion: "state this block once and refer back to it instead of repasting it",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
