import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { baselineRegression } from "../../src/rules/baseline-regression.js";

describe("baseline-regression", () => {
  it("flags growth past the tolerance", async () => {
    const report = await analyze("this prompt has grown quite a bit since it was first written", {
      model: "gpt-4o",
      rules: [baselineRegression],
      baseline: 5,
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.severity).toBe("error");
    expect(report.findings[0]!.message).toContain("baseline of 5");
  });

  it("stays quiet within tolerance", async () => {
    const report = await analyze("short prompt", {
      model: "gpt-4o",
      rules: [baselineRegression],
      baseline: 2,
    });
    expect(report.findings).toEqual([]);
  });

  it("does nothing when no baseline is recorded", async () => {
    const report = await analyze("this prompt has grown quite a bit since it was first written", {
      model: "gpt-4o",
      rules: [baselineRegression],
    });
    expect(report.findings).toEqual([]);
  });

  it("gives a sensible message for a zero baseline instead of dividing by zero", async () => {
    const report = await analyze("hello world this is a real prompt with actual content", {
      model: "gpt-4o",
      rules: [baselineRegression],
      baseline: 0,
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.message).not.toContain("Infinity");
    expect(report.findings[0]?.message).toContain("grew from an empty baseline");
  });
});
