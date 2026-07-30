import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import type { Rule } from "../src/rule.js";

// reference implementation: what the dedup *should* produce, computed independently
// of analyze.ts's own sumSavingsDedupedByExactRange, so the property test can't just
// be asserting the implementation against itself
function expectedTotal(spans: { range: [number, number]; saved: number }[]): number {
  const maxByRange = new Map<string, number>();
  for (const s of spans) {
    if (s.saved <= 0) continue;
    const key = `${s.range[0]}:${s.range[1]}`;
    maxByRange.set(key, Math.max(maxByRange.get(key) ?? 0, s.saved));
  }
  let total = 0;
  for (const v of maxByRange.values()) total += v;
  return total;
}

function ruleFromSpans(spans: { range: [number, number]; saved: number }[]): Rule {
  return {
    id: "synthetic",
    defaultSeverity: "info",
    why: "test fixture rule",
    check(ctx, severity) {
      return spans.map((s, i) => ({
        ruleId: "synthetic",
        severity,
        message: `span ${i}`,
        why: "test fixture rule",
        loc: { input: ctx.inputRef, range: s.range },
        tokens: { current: s.saved + 1, afterFix: 1, saved: s.saved },
        confidence: "exact" as const,
      }));
    },
  };
}

const span = fc
  .tuple(fc.nat({ max: 500 }), fc.integer({ min: 1, max: 50 }))
  .map(([start, len]): [number, number] => [start, start + len]);

const spanWithSaved = fc.record({ range: span, saved: fc.nat({ max: 1000 }) });

describe("totalWasteTokens dedup (property-based)", () => {
  it("matches a reference max-per-exact-range implementation for arbitrary findings", () => {
    fc.assert(
      fc.property(fc.array(spanWithSaved, { maxLength: 20 }), (spans) => {
        const text = "x".repeat(600);
        const report = analyze(text, { model: "gpt-4o", rules: [ruleFromSpans(spans)] });
        expect(report.summary.totalWasteTokens).toBe(expectedTotal(spans));
      }),
    );
  });

  it("never exceeds the naive sum of every finding's saved tokens", () => {
    fc.assert(
      fc.property(fc.array(spanWithSaved, { maxLength: 20 }), (spans) => {
        const text = "x".repeat(600);
        const report = analyze(text, { model: "gpt-4o", rules: [ruleFromSpans(spans)] });
        const naiveSum = spans.reduce((sum, s) => sum + s.saved, 0);
        expect(report.summary.totalWasteTokens).toBeLessThanOrEqual(naiveSum);
      }),
    );
  });

  it("is never negative", () => {
    fc.assert(
      fc.property(fc.array(spanWithSaved, { maxLength: 20 }), (spans) => {
        const text = "x".repeat(600);
        const report = analyze(text, { model: "gpt-4o", rules: [ruleFromSpans(spans)] });
        expect(report.summary.totalWasteTokens).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("sums findings with distinct ranges in full, regardless of how much they overlap", () => {
    // this is the specific behavior the exact-range fix protects: a narrower finding nested
    // inside a broader one (different ranges) must be additive, not swallowed
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 200, max: 400 }),
        fc.integer({ min: 101, max: 199 }),
        fc.integer({ min: 1, max: 50 }),
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (outerStart, outerEnd, innerStart, innerLen, outerSaved, innerSaved) => {
          const innerEnd = innerStart + innerLen;
          fc.pre(innerEnd < outerEnd);
          const spans = [
            { range: [outerStart, outerEnd] as [number, number], saved: outerSaved },
            { range: [innerStart, innerEnd] as [number, number], saved: innerSaved },
          ];
          const text = "x".repeat(500);
          const report = analyze(text, { model: "gpt-4o", rules: [ruleFromSpans(spans)] });
          expect(report.summary.totalWasteTokens).toBe(outerSaved + innerSaved);
        },
      ),
    );
  });
});
