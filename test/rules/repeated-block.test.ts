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

  it("reports a repeated line once, not once per overlapping-boundary variant", () => {
    // this reminder repeats 3 times overall, but only 2 of those 3
    // occurrences are followed by "Example", and only the other 2 have a
    // leading blank line before them -- so the suffix automaton legitimately
    // finds three distinct maximal repeats (12-token x3, plus two 13/14-token
    // variants x2) at overlapping positions. Without dedup this rule used to
    // report all three as separate findings for what's really one repeated line.
    const prompt = [
      "You are a support ticket classifier. Classify each ticket into one of: billing, technical, account.",
      "Remember to respond with only the category name, nothing else.",
      "",
      "Example 1:",
      'Ticket: "I was charged twice this month"',
      "Classification: billing",
      "Remember to respond with only the category name, nothing else.",
      "",
      "Example 2:",
      'Ticket: "I cant reset my password"',
      "Classification: account",
      "Remember to respond with only the category name, nothing else.",
      "",
      'Ticket 550e8400-e29b-41d4-a716-446655440000, from a customer: "refund please"',
    ].join("\n");

    const report = analyze(prompt, { model: "gpt-4o", rules: [repeatedBlock] });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.message).toContain("repeats 3 times");
  });

  it("does not flag a repeated JSON key/punctuation fragment across array rows", () => {
    const prompt = JSON.stringify({
      results: [
        { id: 1, title: "Perplexity valuation reaches new high", url: "https://a.example.com/1" },
        { id: 2, title: "Perplexity spaces launch", url: "https://a.example.com/2" },
        { id: 3, title: "Perplexity enterprise adoption doubles", url: "https://a.example.com/3" },
      ],
    });

    const report = analyze(prompt, { model: "gpt-4o", rules: [repeatedBlock] });
    expect(report.findings).toEqual([]);
  });

  it("still flags a genuinely repeated value that appears both inside and outside JSON", () => {
    const prompt = [
      JSON.stringify({ created_by: "priya.nataraj@acmecorp.example.com" }),
      "New question from priya.nataraj@acmecorp.example.com: what's the total spend?",
    ].join("\n");

    const report = analyze(prompt, { model: "gpt-4o", rules: [repeatedBlock] });
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0]?.message).toContain("repeats 2 times");
  });
});
