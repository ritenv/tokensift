import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { budgetExceeded } from "../../src/rules/budget-exceeded.js";

describe("budget-exceeded", () => {
  it("flags an input that exceeds the declared budget", () => {
    const report = analyze("this prompt has more than a couple of tokens in it", {
      model: "gpt-4o",
      rules: [budgetExceeded],
      budget: 5,
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.severity).toBe("error");
  });

  it("stays quiet when the input is under budget", () => {
    const report = analyze("short prompt", {
      model: "gpt-4o",
      rules: [budgetExceeded],
      budget: 100,
    });
    expect(report.findings).toEqual([]);
  });

  it("does nothing when no budget is configured", () => {
    const report = analyze("this prompt has more than a couple of tokens in it", {
      model: "gpt-4o",
      rules: [budgetExceeded],
    });
    expect(report.findings).toEqual([]);
  });
});
