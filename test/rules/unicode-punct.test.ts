import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { unicodePunct } from "../../src/rules/unicode-punct.js";

describe("unicode-punct", () => {
  it("flags a curly quote and offers the straight-quote fix", () => {
    const report = analyze("the customer said “it’s broken”", {
      model: "gpt-4o",
      rules: [unicodePunct],
    });

    const messages = report.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("“"))).toBe(true);
    expect(report.findings.every((f) => f.fix)).toBe(true);
  });

  it("flags an em-dash and a zero-width space", () => {
    const report = analyze("wait​—really?", { model: "gpt-4o", rules: [unicodePunct] });
    const chars = report.findings.map((f) => f.fix?.replacement);
    expect(chars).toContain("--");
    expect(chars).toContain("");
  });

  it("finds nothing in plain ASCII prose", () => {
    const report = analyze('the customer said "it\'s broken"', {
      model: "gpt-4o",
      rules: [unicodePunct],
    });
    expect(report.findings).toEqual([]);
  });
});
