import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import type { Rule } from "../src/rule.js";

interface FixSpec {
  range: [number, number];
  replacement: string;
}

function ruleFromFixes(specs: FixSpec[], ruleId = "synthetic-fix-rule"): Rule {
  return {
    id: ruleId,
    defaultSeverity: "info",
    why: "test fixture rule",
    check(ctx, severity) {
      return specs.map((s, i) => ({
        ruleId,
        severity,
        message: `fix ${i}`,
        why: "test fixture rule",
        loc: { input: ctx.inputRef, range: s.range },
        tokens: { current: 1, afterFix: 0, saved: 1 },
        fix: { description: `fix ${i}`, range: s.range, replacement: s.replacement },
        confidence: "exact" as const,
      }));
    },
  };
}

// deterministic shuffle driven by fast-check, not Math.random, so failures reproduce
function shuffle<T>(arr: T[], seedArb: number[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (seedArb[i] ?? 0) % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

describe("applyFixes (property-based)", () => {
  it("never throws, including on out-of-order, overlapping, or out-of-bounds ranges", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.array(
          fc.record({
            range: fc
              .tuple(fc.integer({ min: -20, max: 220 }), fc.integer({ min: -20, max: 220 }))
              .map(([a, b]): [number, number] => (a <= b ? [a, b] : [b, a])),
            replacement: fc.string({ maxLength: 10 }),
          }),
          { maxLength: 15 },
        ),
        (length, specs) => {
          const text = "x".repeat(length);
          const report = analyze(text, { model: "gpt-4o", rules: [ruleFromFixes(specs)] });
          expect(() => report.applyFixes()).not.toThrow();
          expect(typeof report.applyFixes()).toBe("string");
        },
      ),
    );
  });

  it("applies every fix in a disjoint set, regardless of the order findings were reported in", () => {
    const disjointCase = fc
      .integer({ min: 20, max: 300 })
      .chain((length) =>
        fc.record({
          length: fc.constant(length),
          cuts: fc
            .uniqueArray(fc.integer({ min: 1, max: length - 1 }), { minLength: 0, maxLength: 8 })
            .map((a) => [...a].sort((x, y) => x - y)),
        }),
      )
      .chain(({ length, cuts }) => {
        const boundaries = [0, ...cuts, length];
        const segmentCount = boundaries.length - 1;
        return fc.record({
          length: fc.constant(length),
          boundaries: fc.constant(boundaries),
          fixedFlags: fc.array(fc.boolean(), { minLength: segmentCount, maxLength: segmentCount }),
          shuffleSeed: fc.array(fc.nat({ max: 20 }), {
            minLength: segmentCount,
            maxLength: segmentCount,
          }),
        });
      });

    fc.assert(
      fc.property(disjointCase, ({ length, boundaries, fixedFlags, shuffleSeed }) => {
        const text = "x".repeat(length);
        const segments: [number, number][] = [];
        for (let i = 0; i < boundaries.length - 1; i++)
          segments.push([boundaries[i]!, boundaries[i + 1]!]);

        const expectedParts: string[] = [];
        const specs: FixSpec[] = [];
        segments.forEach((seg, i) => {
          if (fixedFlags[i]) {
            const replacement = `<<FIX${i}>>`;
            expectedParts.push(replacement);
            specs.push({ range: seg, replacement });
          } else {
            expectedParts.push(text.slice(seg[0], seg[1]));
          }
        });

        const shuffledSpecs = shuffle(specs, shuffleSeed);
        const report = analyze(text, { model: "gpt-4o", rules: [ruleFromFixes(shuffledSpecs)] });
        expect(report.applyFixes()).toBe(expectedParts.join(""));
      }),
    );
  });

  it("of two overlapping fixes, only the one starting earlier is applied", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 250 }),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 10 }),
        (aStart, aLen, bOffset, bLen) => {
          const aEnd = aStart + aLen;
          const bStart = aStart + bOffset;
          fc.pre(bStart < aEnd); // guarantee real overlap
          const bEnd = bStart + bLen;
          const length = Math.max(aEnd, bEnd) + 10;
          const text = "x".repeat(length);

          const specs: FixSpec[] = [
            { range: [aStart, aEnd], replacement: "<<FIXA>>" },
            { range: [bStart, bEnd], replacement: "<<FIXB>>" },
          ];
          const report = analyze(text, { model: "gpt-4o", rules: [ruleFromFixes(specs)] });
          const result = report.applyFixes();

          expect(result).toBe(`${text.slice(0, aStart)}<<FIXA>>${text.slice(aEnd)}`);
          expect(result).not.toContain("<<FIXB>>");
        },
      ),
    );
  });

  it("respects ruleIds filtering: fixes from excluded rules never appear, and don't block others", () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 100 }), (length) => {
        const text = "x".repeat(length);
        const includedRule = ruleFromFixes(
          [{ range: [0, 3], replacement: "<<KEEP>>" }],
          "included",
        );
        const excludedRule = ruleFromFixes(
          [{ range: [5, 8], replacement: "<<DROP>>" }],
          "excluded",
        );

        const report = analyze(text, { model: "gpt-4o", rules: [includedRule, excludedRule] });
        const result = report.applyFixes({ ruleIds: ["included"] });
        expect(result).toContain("<<KEEP>>");
        expect(result).not.toContain("<<DROP>>");
      }),
    );
  });
});
