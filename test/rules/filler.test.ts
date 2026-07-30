import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { filler } from "../../src/rules/filler.js";
import { dyn, t } from "../../src/tag.js";

describe("filler", () => {
  it("flags hedging phrases and reports one aggregate finding", () => {
    const report = analyze(
      "I was wondering if you could summarize this ticket, if it's not too much trouble.",
      { model: "gpt-4o", rules: [filler] },
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).toContain("2 filler phrases");
  });

  it("counts a single filler phrase in the singular", () => {
    const report = analyze("please kindly review the attached document", {
      model: "gpt-4o",
      rules: [filler],
    });
    expect(report.findings[0]!.message).toContain("1 filler phrase ");
  });

  it("never fires inside a dyn() slot, that's user content not our prose", () => {
    const prompt = t`Reply to this message: ${dyn("userMessage", { sample: "if you don't mind, can you help?" })}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [filler] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing in a direct, hedge-free instruction", () => {
    const report = analyze("summarize the ticket below in three bullet points", {
      model: "gpt-4o",
      rules: [filler],
    });
    expect(report.findings).toEqual([]);
  });

  it("points loc.range at the first hit only, not a span covering unrelated content between hits", () => {
    const first = "I was wondering if you could help.";
    const filling = "unrelated content ".repeat(50);
    const second = "Also, if you don't mind, one more thing.";
    const text = `${first}\n\n${filling}\n\n${second}`;

    const report = analyze(text, { model: "gpt-4o", rules: [filler] });
    const [start, end] = report.findings[0]!.loc.range;
    expect(text.slice(start, end)).toBe("I was wondering if you could");
    expect(end - start).toBeLessThan(first.length + 5);
  });
});
