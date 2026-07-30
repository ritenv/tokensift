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

  it("measures current cost from the real (pretty-printed) text, not a minified reserialization", () => {
    const pretty = JSON.stringify(rows, null, 2);
    const prompt = `here are the open tickets:\n${pretty}\nsummarize them`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [rowJson] });
    const finding = report.findings[0]!;
    const realTextTokens = analyze(pretty, { model: "gpt-4o", rules: [] }).summary.totalTokens;
    expect(finding.tokens.current).toBe(realTextTokens);
  });

  it("flags a uniform array wrapped in a named key, not just a bare top-level array", () => {
    const prompt = JSON.stringify({ tickets: rows });
    const report = analyze(prompt, { model: "gpt-4o", rules: [rowJson] });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.message).toContain("4 rows");
  });

  it("locates the wrapped array's real source span, not the whole wrapping object", () => {
    const pretty = JSON.stringify({ tickets: rows }, null, 2);
    const report = analyze(pretty, { model: "gpt-4o", rules: [rowJson] });
    const [start, end] = report.findings[0]!.loc.range;
    const located = pretty.slice(start, end);
    expect(located.startsWith("[")).toBe(true);
    expect(located.endsWith("]")).toBe(true);
    expect(located).not.toContain("tickets");
    expect(JSON.parse(located)).toEqual(rows);
  });

  it("does not flag a wrapped array of objects with different shapes", () => {
    const mixed = [
      { id: 1, status: "open" },
      { id: 2, note: "different shape entirely" },
      { id: 3, status: "closed" },
    ];
    const report = analyze(JSON.stringify({ tickets: mixed }), {
      model: "gpt-4o",
      rules: [rowJson],
    });
    expect(report.findings).toEqual([]);
  });

  it("never suggests CSV when a row has a nested object value, since CSV would silently collapse it", () => {
    const nestedRows = [
      { id: 1, name: "Alice", meta: { dept: "eng", level: 3 } },
      { id: 2, name: "Bob", meta: { dept: "sales", level: 2 } },
      { id: 3, name: "Carol", meta: { dept: "eng", level: 1 } },
    ];
    const report = analyze(JSON.stringify(nestedRows), { model: "gpt-4o", rules: [rowJson] });
    expect(report.findings[0]?.message).toContain("columnar JSON");
    expect(report.findings[0]?.message).not.toContain("CSV");
  });
});
