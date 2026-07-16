import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { prettyJson } from "../../src/rules/pretty-json.js";

describe("pretty-json", () => {
  it("flags an indented JSON blob embedded in a prompt", () => {
    const prompt = `here is the order:\n${JSON.stringify(
      { id: 1, status: "open", items: ["pen", "paper"] },
      null,
      2,
    )}\nplease summarize it`;

    const report = analyze(prompt, { model: "gpt-4o", rules: [prettyJson] });
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.tokens.current).toBeGreaterThan(finding.tokens.afterFix);
    expect(finding.fix?.replacement).toBe(
      JSON.stringify({ id: 1, status: "open", items: ["pen", "paper"] }),
    );
  });

  it("does not flag JSON that's already minified", () => {
    const prompt = `order: ${JSON.stringify({ id: 1, status: "open" })}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [prettyJson] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing when there's no embedded JSON", () => {
    const report = analyze("summarize the ticket below in plain prose", {
      model: "gpt-4o",
      rules: [prettyJson],
    });
    expect(report.findings).toEqual([]);
  });
});
