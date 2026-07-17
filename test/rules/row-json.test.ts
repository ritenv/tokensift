import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { rowJson } from "../../src/rules/row-json.js";

const rows = [
  { id: 1, status: "open", customer: "Acme Corp" },
  { id: 2, status: "closed", customer: "Globex Inc" },
  { id: 3, status: "open", customer: "Initech" },
  { id: 4, status: "pending", customer: "Umbrella LLC" },
];

describe("row-json", () => {
  it("flags a uniform array of row objects and picks the cheaper CSV alternative", () => {
    const prompt = `here are the open tickets:\n${JSON.stringify(rows)}\nsummarize them`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [rowJson] });
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.message).toContain("4 rows");
    expect(finding.tokens.current).toBeGreaterThan(finding.tokens.afterFix);
  });

  it("does not flag a short array, below the row threshold", () => {
    const prompt = JSON.stringify(rows.slice(0, 2));
    const report = analyze(prompt, { model: "gpt-4o", rules: [rowJson] });
    expect(report.findings).toEqual([]);
  });

  it("does not flag an array of objects with different shapes", () => {
    const mixed = [
      { id: 1, status: "open" },
      { id: 2, note: "different shape entirely" },
      { id: 3, status: "closed" },
    ];
    const report = analyze(JSON.stringify(mixed), { model: "gpt-4o", rules: [rowJson] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing when there's no embedded JSON", () => {
    const report = analyze("summarize the ticket below in plain prose", {
      model: "gpt-4o",
      rules: [rowJson],
    });
    expect(report.findings).toEqual([]);
  });
});
