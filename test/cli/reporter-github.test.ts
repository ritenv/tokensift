import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { formatGithub } from "../../src/cli/reporter-github.js";
import { uuidBloat } from "../../src/rules/uuid-bloat.js";

describe("formatGithub", () => {
  it("emits one workflow command per finding, mapped by severity", () => {
    const text = "id: 550e8400-e29b-41d4-a716-446655440000";
    const report = analyze(text, { model: "gpt-4o", rules: [uuidBloat] });

    const output = formatGithub([{ file: "a.txt", report, text }]);

    expect(output).toContain("::warning file=a.txt,title=uuid-bloat,line=1,endLine=1::");
    expect(output).toContain("costs 18 tokens");
  });

  it("computes the correct line number for a finding past the first line", () => {
    const text = "line one\nline two\nid: 550e8400-e29b-41d4-a716-446655440000";
    const report = analyze(text, { model: "gpt-4o", rules: [uuidBloat] });

    const output = formatGithub([{ file: "a.txt", report, text }]);

    expect(output).toContain("line=3,endLine=3");
  });

  it("omits line/endLine when the original text isn't available (non-string input)", () => {
    const report = analyze(
      [{ role: "user", content: "id: 550e8400-e29b-41d4-a716-446655440000" }],
      {
        model: "gpt-4o",
        rules: [uuidBloat],
      },
    );

    const output = formatGithub([{ file: "a.txt", report }]);

    expect(output).toContain("file=a.txt,title=uuid-bloat::");
    expect(output).not.toContain("line=");
  });

  it("escapes commas and colons in property values", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    const output = formatGithub([{ file: "weird,name:here.txt", report, text: "irrelevant" }]);

    expect(output).toContain("file=weird%2Cname%3Ahere.txt");
  });

  it("produces no output when there are no findings", () => {
    const report = analyze("nothing wasteful here", { model: "gpt-4o", rules: [uuidBloat] });
    expect(formatGithub([{ file: "a.txt", report, text: "nothing wasteful here" }])).toBe("");
  });
});
