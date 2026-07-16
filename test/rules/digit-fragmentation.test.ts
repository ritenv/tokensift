import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { digitFragmentation } from "../../src/rules/digit-fragmentation.js";

describe("digit-fragmentation", () => {
  it("flags a full ISO-8601 timestamp with milliseconds", () => {
    const report = analyze("event logged at 2024-08-15T14:32:07.123Z during the outage", {
      model: "gpt-4o",
      rules: [digitFragmentation],
    });
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.tokens.current).toBeGreaterThan(finding.tokens.afterFix);
  });

  it("flags a timestamp without milliseconds", () => {
    const report = analyze("created_at: 2024-08-15T14:32:07Z", {
      model: "gpt-4o",
      rules: [digitFragmentation],
    });
    expect(report.findings).toHaveLength(1);
  });

  it("ignores an invalid date that merely looks ISO-shaped", () => {
    const report = analyze("id: 9999-99-99T99:99:99Z", {
      model: "gpt-4o",
      rules: [digitFragmentation],
    });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing in prose with no timestamps", () => {
    const report = analyze("summarize the attached document in three bullet points", {
      model: "gpt-4o",
      rules: [digitFragmentation],
    });
    expect(report.findings).toEqual([]);
  });
});
