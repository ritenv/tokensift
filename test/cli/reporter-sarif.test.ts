import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { formatSarif } from "../../src/cli/reporter-sarif.js";
import { uuidBloat } from "../../src/rules/uuid-bloat.js";

describe("formatSarif", () => {
  it("produces a valid SARIF 2.1.0 log with one result per finding", () => {
    const text = "id: 550e8400-e29b-41d4-a716-446655440000";
    const report = analyze(text, { model: "gpt-4o", rules: [uuidBloat] });

    const output = formatSarif([{ file: "a.txt", report, text }]);
    const parsed = JSON.parse(output);

    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe("tokensift");
    expect(parsed.runs[0].results).toHaveLength(1);
    expect(parsed.runs[0].results[0].ruleId).toBe("uuid-bloat");
    expect(parsed.runs[0].results[0].level).toBe("warning");
    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      "a.txt",
    );
    expect(parsed.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(1);
  });

  it("maps severity to SARIF's level enum for all three severities", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    const patched = {
      ...report,
      findings: [
        { ...report.findings[0]!, severity: "error" as const },
        { ...report.findings[0]!, severity: "warn" as const },
        { ...report.findings[0]!, severity: "info" as const },
      ],
    };

    const parsed = JSON.parse(formatSarif([{ file: "a.txt", report: patched }]));
    expect(parsed.runs[0].results.map((r: { level: string }) => r.level)).toEqual([
      "error",
      "warning",
      "note",
    ]);
  });

  it("dedupes rule metadata across multiple findings from the same rule", () => {
    const report = analyze(
      "id: 550e8400-e29b-41d4-a716-446655440000, id: 6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      { model: "gpt-4o", rules: [uuidBloat] },
    );

    const parsed = JSON.parse(formatSarif([{ file: "a.txt", report }]));
    expect(parsed.runs[0].results.length).toBeGreaterThan(1);
    expect(parsed.runs[0].tool.driver.rules).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.rules[0].id).toBe("uuid-bloat");
  });

  it("omits region when the original text isn't available (non-string input)", () => {
    const report = analyze(
      [{ role: "user", content: "id: 550e8400-e29b-41d4-a716-446655440000" }],
      {
        model: "gpt-4o",
        rules: [uuidBloat],
      },
    );

    const parsed = JSON.parse(formatSarif([{ file: "a.txt", report }]));
    expect(parsed.runs[0].results[0].locations[0].physicalLocation.region).toBeUndefined();
    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      "a.txt",
    );
  });

  it("produces an empty results array and rules array when there are no findings", () => {
    const report = analyze("nothing wasteful here", { model: "gpt-4o", rules: [uuidBloat] });
    const parsed = JSON.parse(
      formatSarif([{ file: "a.txt", report, text: "nothing wasteful here" }]),
    );
    expect(parsed.runs[0].results).toEqual([]);
    expect(parsed.runs[0].tool.driver.rules).toEqual([]);
  });
});
