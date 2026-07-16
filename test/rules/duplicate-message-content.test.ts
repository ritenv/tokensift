import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { duplicateMessageContent } from "../../src/rules/duplicate-message-content.js";

const systemPrompt =
  "You are a support agent. Always be polite, concise, and never share internal ticket ids with the customer.";

describe("duplicate-message-content", () => {
  it("flags a user message that repeats the system prompt verbatim, a template bug", () => {
    const report = analyze(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: systemPrompt },
        { role: "user", content: "my order hasn't shipped yet" },
      ],
      { model: "gpt-4o", rules: [duplicateMessageContent] },
    );

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.message).toContain("message 1");
    expect(finding.loc.messageIndex).toBe(1);
  });

  it("does not flag two different messages with different content", () => {
    const report = analyze(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: "my order hasn't shipped yet" },
      ],
      { model: "gpt-4o", rules: [duplicateMessageContent] },
    );
    expect(report.findings).toEqual([]);
  });

  it("does not flag short, incidentally identical replies like 'thanks'", () => {
    const report = analyze(
      [
        { role: "user", content: "thanks" },
        { role: "assistant", content: "you're welcome" },
        { role: "user", content: "thanks" },
      ],
      { model: "gpt-4o", rules: [duplicateMessageContent] },
    );
    expect(report.findings).toEqual([]);
  });

  it("does nothing for plain string input, no messages to compare", () => {
    const report = analyze("summarize the ticket below", {
      model: "gpt-4o",
      rules: [duplicateMessageContent],
    });
    expect(report.findings).toEqual([]);
  });
});
