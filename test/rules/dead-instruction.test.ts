import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { deadInstruction } from "../../src/rules/dead-instruction.js";

describe("dead-instruction", () => {
  it("flags 'as shown above' when nothing structured precedes it", async () => {
    const report = await analyze("Respond in the format above.", {
      model: "gpt-4o",
      rules: [deadInstruction],
    });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag 'as shown above' when a JSON schema actually precedes it", async () => {
    const prompt = `Schema:\n${JSON.stringify({ type: "object" })}\nRespond in the format shown above.`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toEqual([]);
  });

  it("flags 'the examples above' when no other mention of examples exists", async () => {
    const report = await analyze("Classify the ticket using the examples above.", {
      model: "gpt-4o",
      rules: [deadInstruction],
    });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag 'the examples above' when examples are actually present", async () => {
    const prompt = "Example 1: foo -> bar\n\nClassify the ticket using the examples above.";
    const report = await analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing in a prompt with no dangling references", async () => {
    const report = await analyze("summarize the ticket below in three bullet points", {
      model: "gpt-4o",
      rules: [deadInstruction],
    });
    expect(report.findings).toEqual([]);
  });

  it("flags a dead 'as shown above' even when unrelated JSON exists far earlier in the prompt", async () => {
    const prompt = `Config:\n${JSON.stringify({ a: 1 })}\n\n${"irrelevant filler ".repeat(30)}\n\nNow respond as shown above.`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toHaveLength(1);
  });

  it("flags a dead 'the examples provided' even when the word 'example' is used unrelatedly far away", async () => {
    const prompt = `For example, consider edge cases carefully.\n\n${"filler text here ".repeat(20)}\n\nNow classify using the examples provided.`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toHaveLength(1);
  });

  it("flags a dead 'as shown below' even when a stray code-fence mention exists far away", async () => {
    const prompt = `Respond as shown below. ${"filler ".repeat(40)}By the way, to start a code block you would type \`\`\` then code then \`\`\` to close it.`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [deadInstruction] });
    expect(report.findings).toHaveLength(1);
  });
});
