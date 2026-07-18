import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { formatJson } from "../../src/cli/reporter-json.js";
import { uuidBloat } from "../../src/rules/uuid-bloat.js";

describe("formatJson", () => {
  it("produces one valid JSON document for the whole run", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    const output = formatJson([{ file: "a.txt", report }]);
    const parsed = JSON.parse(output);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].file).toBe("a.txt");
    expect(parsed.results[0].findings).toHaveLength(1);
    expect(parsed.results[0].findings[0].ruleId).toBe("uuid-bloat");
    expect(parsed.results[0].summary.totalTokens).toBeGreaterThan(0);
  });

  it("aggregates multiple files into one results array", () => {
    const clean = analyze("summarize the ticket", { model: "gpt-4o", rules: [uuidBloat] });
    const dirty = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    const output = formatJson([
      { file: "clean.txt", report: clean },
      { file: "dirty.txt", report: dirty },
    ]);
    const parsed = JSON.parse(output);

    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].findings).toEqual([]);
    expect(parsed.results[1].findings).toHaveLength(1);
  });
});
