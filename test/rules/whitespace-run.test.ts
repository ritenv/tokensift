import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { whitespaceRun } from "../../src/rules/whitespace-run.js";

describe("whitespace-run", () => {
  it("flags a long mid-line run of spaces, copy-pasted from a spreadsheet", () => {
    const report = analyze(`summarize the ticket:${" ".repeat(80)}urgent`, {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings.some((f) => f.fix?.replacement === " ")).toBe(true);
  });

  it("flags a long trailing whitespace run on a line", () => {
    const report = analyze(`first line${" ".repeat(80)}\nsecond line`, {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings.some((f) => f.fix?.replacement === "")).toBe(true);
  });

  it("flags a long run of blank lines and collapses to one", () => {
    const report = analyze(`first line${"\n".repeat(20)}second line`, {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings.some((f) => f.fix?.replacement === "\n\n")).toBe(true);
  });

  it("does not flag a short mid-line run, the tokenizer already absorbs it for free", () => {
    const report = analyze("summarize the    ticket below", {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings).toEqual([]);
  });

  it("leaves single spaces and single blank lines alone", () => {
    const report = analyze("first line\n\nsecond line, all good", {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings).toEqual([]);
  });

  it("leaves leading indentation alone", () => {
    const report = analyze("  indented under a heading", {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not touch whitespace inside a fenced code block", () => {
    const report = analyze(
      `Example:\n\`\`\`js\nconst x = 1;${" ".repeat(80)}\nconst y = 2;\n\`\`\``,
      {
        model: "gpt-4o",
        rules: [whitespaceRun],
      },
    );
    expect(report.findings).toEqual([]);
  });

  it("still flags the same whitespace run outside a code fence, as a control", () => {
    const report = analyze(`const x = 1;${" ".repeat(80)}\nconst y = 2;`, {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("treats everything after an unclosed fence marker as code, conservatively", () => {
    const report = analyze(`\`\`\`js\nunclosed fence${" ".repeat(80)}\n`, {
      model: "gpt-4o",
      rules: [whitespaceRun],
    });
    expect(report.findings).toEqual([]);
  });
});
