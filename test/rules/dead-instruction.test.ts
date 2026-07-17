import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { deadInstruction } from "../../src/rules/dead-instruction.js";

describe("dead-instruction", () => {
  it("flags 'as shown above' when nothing structured precedes it", () => {
    const report = analyze("Respond in the format above.", {
      model: "gpt-4o",
      rules: [deadInstruction],
    });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag 'as shown above' when a JSON schema actually precedes it", () => {
    const prompt = `Schema:\n${JSON.stringify({ type: "object" })}\nRespond in the format shown above.`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toEqual([]);
  });

  it("flags 'the examples above' when no other mention of examples exists", () => {
    const report = analyze("Classify the ticket using the examples above.", {
      model: "gpt-4o",
      rules: [deadInstruction],
    });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag 'the examples above' when examples are actually present", () => {
    const prompt = "Example 1: foo -> bar\n\nClassify the ticket using the examples above.";
    const report = analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing in a prompt with no dangling references", () => {
    const report = analyze("summarize the ticket below in three bullet points", {
      model: "gpt-4o",
      rules: [deadInstruction],
    });
    expect(report.findings).toEqual([]);
  });
});
