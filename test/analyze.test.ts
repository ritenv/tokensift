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
});
