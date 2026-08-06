import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { formatMarkdown } from "../../src/cli/reporter-markdown.js";
import { uuidBloat } from "../../src/rules/uuid-bloat.js";

describe("formatMarkdown", () => {
  it("summarizes finding counts and lists each finding in a table", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    const output = formatMarkdown([{ file: "a.txt", report }]);

    expect(output).toContain("## tokensift");
    expect(output).toContain("1 file(s), 1 finding(s)");
    expect(output).toContain("0 error, 1 warn, 0 info");
    expect(output).toContain("| a.txt | uuid-bloat | warn |");
    expect(output).toMatch(/Total addressable waste: ~\d+ tokens/);
  });

  it("aggregates across multiple files", () => {
    const clean = analyze("summarize the ticket", { model: "gpt-4o", rules: [uuidBloat] });
    const dirty = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    const output = formatMarkdown([
      { file: "clean.txt", report: clean },
      { file: "dirty.txt", report: dirty },
    ]);

    expect(output).toContain("2 file(s), 1 finding(s)");
  });

  it("omits the findings table when there are no findings", () => {
    const report = analyze("nothing wasteful here", { model: "gpt-4o", rules: [uuidBloat] });
    const output = formatMarkdown([{ file: "a.txt", report }]);
    expect(output).not.toContain("| File | Rule |");
  });

  it("escapes pipe characters inside a finding message", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    const patched = {
      ...report,
      findings: report.findings.map((f) => ({ ...f, message: `a | pipe in ${f.message}` })),
    };

    const output = formatMarkdown([{ file: "a.txt", report: patched }]);
    expect(output).toContain("a \\| pipe in");
  });
});
