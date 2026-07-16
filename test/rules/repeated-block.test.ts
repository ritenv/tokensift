import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { repeatedBlock } from "../../src/rules/repeated-block.js";

const boilerplate =
  "Remember to respond only in valid JSON matching the schema above, with no extra prose or markdown fences.";

describe("repeated-block", () => {
  it("flags a boilerplate paragraph re-pasted across few-shot examples", () => {
    const prompt = [
      `Example 1: summarize this ticket. ${boilerplate}`,
      `Example 2: summarize this other ticket. ${boilerplate}`,
      `Example 3: summarize a third ticket. ${boilerplate}`,
    ].join("\n\n");

    const report = analyze(prompt, { model: "gpt-4o", rules: [repeatedBlock] });
    expect(report.findings.length).toBeGreaterThan(0);
    const finding = report.findings[0]!;
    expect(finding.message).toContain("repeats 3 times");
    expect(finding.tokens.saved).toBeGreaterThan(0);
  });

  it("does not flag short, incidental repeated words", () => {
    const report = analyze("the ticket the customer the agent the ticket the customer", {
      model: "gpt-4o",
      rules: [repeatedBlock],
    });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing in a prompt with no repetition", () => {
    const report = analyze("summarize the attached document in three bullet points", {
      model: "gpt-4o",
      rules: [repeatedBlock],
    });
    expect(report.findings).toEqual([]);
  });
});
