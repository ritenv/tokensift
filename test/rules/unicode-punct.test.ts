import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { unicodePunct } from "../../src/rules/unicode-punct.js";

describe("unicode-punct", () => {
  it("flags a zero-width space, which has real measured savings, and offers a fix", () => {
    const report = analyze("hello​world", { model: "gpt-4o", rules: [unicodePunct] });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.tokens.saved).toBeGreaterThan(0);
    expect(report.findings[0]?.fix?.replacement).toBe("");
  });

  it("does not flag a character whose ASCII replacement costs the same or more, even though it's a NORMALIZE target", () => {
    // em-dash -> "--" measures zero real savings under o200k_base (both sides tokenize
    // to 1 token); firing here would be an autofixable "fix" that doesn't actually help.
    const report = analyze("wait—really", { model: "gpt-4o", rules: [unicodePunct] });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a curly quote when its straight-quote replacement isn't actually cheaper", () => {
    const report = analyze('the customer said "it’s broken"', {
      model: "gpt-4o",
      rules: [unicodePunct],
    });
    expect(report.findings).toEqual([]);
  });

  it("drops fix and falls back to a plain suggestion when autofix is off", () => {
    const report = analyze("hello​world", {
      model: "gpt-4o",
      rules: [unicodePunct],
      autofix: false,
    });
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.fix === undefined)).toBe(true);
    expect(report.findings.every((f) => f.suggestion === "normalize to the ASCII equivalent")).toBe(
      true,
    );
  });

  it("finds nothing in plain ASCII prose", () => {
    const report = analyze('the customer said "it\'s broken"', {
      model: "gpt-4o",
      rules: [unicodePunct],
    });
    expect(report.findings).toEqual([]);
  });
});
