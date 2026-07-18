import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import type { Rule } from "../src/rule.js";
import { dyn, t } from "../src/tag.js";
import type { Message } from "../src/types.js";

// A minimal rule that just flags every occurrence of the word "please",
// enough to prove findings flow through analyze() without pulling in a real
// rule (uuid-bloat lands in its own commit).
const flagsPlease: Rule = {
  id: "flags-please",
  defaultSeverity: "info",
  why: "test fixture rule",
  check(ctx, severity) {
    const idx = ctx.text.indexOf("please");
    if (idx === -1) return [];
    return [
      {
        ruleId: "flags-please",
        severity,
        message: "found 'please'",
        why: "test fixture rule",
        loc: { input: ctx.inputRef, range: [idx, idx + 6] },
        tokens: { current: 1, afterFix: 0, saved: 1 },
        confidence: "exact",
      },
    ];
  },
};

describe("analyze", () => {
  it("tokenizes a plain string and runs the configured rules", () => {
    const report = analyze("could you please help me", {
      model: "gpt-4o",
      rules: [flagsPlease],
    });

    expect(report.findings).toHaveLength(1);
    expect(report.byRule["flags-please"]).toHaveLength(1);
    expect(report.summary.totalTokens).toBeGreaterThan(0);
    expect(report.summary.totalWasteTokens).toBe(1);
  });

  it("returns no findings when no rules are configured", () => {
    const report = analyze("anything at all", { model: "gpt-4o" });
    expect(report.findings).toEqual([]);
    expect(report.byRule).toEqual({});
  });

  it("splits static and dynamic budget for a tagged prompt", () => {
    const prompt = t`You are a support agent.
Ticket: ${dyn("ticketBody", { sample: "my billing failed twice this month" })}`;

    const report = analyze(prompt, { model: "gpt-4o" });
    expect(report.summary.dynamicBudget).toBeGreaterThan(0);
    expect(report.summary.staticTokens).toBe(
      report.summary.totalTokens - report.summary.dynamicBudget,
    );
  });

  it("joins Message[] content for analysis and keeps the messages on the context", () => {
    const messages: Message[] = [
      { role: "system", content: "You are terse." },
      { role: "user", content: "please summarize this" },
    ];

    const report = analyze(messages, { model: "gpt-4o", rules: [flagsPlease] });
    expect(report.findings).toHaveLength(1);
  });

  it("applyFixes applies every fix from every rule when no ruleIds filter is given", () => {
    const upperFirstWord: Rule = {
      id: "upper-first-word",
      defaultSeverity: "info",
      why: "test fixture rule",
      check(ctx, severity) {
        return [
          {
            ruleId: "upper-first-word",
            severity,
            message: "uppercase the first word",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [0, 3] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            fix: { description: "uppercase", range: [0, 3], replacement: "THE" },
            confidence: "exact",
          },
        ];
      },
    };
    const upperLastWord: Rule = {
      id: "upper-last-word",
      defaultSeverity: "info",
      why: "test fixture rule",
      check(ctx, severity) {
        const start = ctx.text.length - 3;
        return [
          {
            ruleId: "upper-last-word",
            severity,
            message: "uppercase the last word",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [start, ctx.text.length] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            fix: { description: "uppercase", range: [start, ctx.text.length], replacement: "DOG" },
            confidence: "exact",
          },
        ];
      },
    };

    const report = analyze("the quick fox", {
      model: "gpt-4o",
      rules: [upperFirstWord, upperLastWord],
    });

    expect(report.applyFixes()).toBe("THE quick DOG");
    expect(report.applyFixes({ ruleIds: ["upper-first-word"] })).toBe("THE quick fox");
    expect(report.applyFixes({ ruleIds: [] })).toBe("the quick fox");
  });

  it("applyFixes is a no-op when nothing has a fix", () => {
    const report = analyze("could you please help me", {
      model: "gpt-4o",
      rules: [flagsPlease],
    });
    expect(report.applyFixes()).toBe("could you please help me");
  });

  it("applyFixes keeps the first of two overlapping fixes, including a same-start tie", () => {
    const overlapping: Rule = {
      id: "overlapping",
      defaultSeverity: "info",
      why: "test fixture rule",
      check(ctx, severity) {
        return [
          {
            ruleId: "overlapping",
            severity,
            message: "first, wins",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [0, 3] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            fix: { description: "a", range: [0, 3], replacement: "AAA" },
            confidence: "exact",
          },
          {
            ruleId: "overlapping",
            severity,
            message: "same start, loses the tie",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [0, 5] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            fix: { description: "b", range: [0, 5], replacement: "BBBBB" },
            confidence: "exact",
          },
          {
            ruleId: "overlapping",
            severity,
            message: "overlaps the first fix's range, loses",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [2, 6] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            fix: { description: "c", range: [2, 6], replacement: "CCCC" },
            confidence: "exact",
          },
        ];
      },
    };

    const report = analyze("abcdefgh", { model: "gpt-4o", rules: [overlapping] });
    expect(report.applyFixes()).toBe("AAAdefgh");
  });

  it("gives rules an indent map, one entry per line", () => {
    let seen: number[] = [];
    const capturesIndent: Rule = {
      id: "captures-indent",
      defaultSeverity: "info",
      why: "test fixture rule",
      check(ctx) {
        seen = ctx.indentMap;
        return [];
      },
    };

    analyze("no indent\n    four spaces\n\teight-ish (tab)", {
      model: "gpt-4o",
      rules: [capturesIndent],
    });

    expect(seen).toEqual([0, 4, 1]);
  });
});
