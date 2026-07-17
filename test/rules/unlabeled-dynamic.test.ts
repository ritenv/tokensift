import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { unlabeledDynamic } from "../../src/rules/unlabeled-dynamic.js";
import { dyn, t } from "../../src/tag.js";

const ticket = {
  id: "TCK-8842",
  customer: "Acme Corp",
  subject: "billing issue with double charge on invoice",
  priority: "high",
  history: ["opened", "assigned", "escalated"],
};

describe("unlabeled-dynamic", () => {
  it("flags a large embedded JSON region with no dyn() wrapper", () => {
    const prompt = `here's the current ticket:\n${JSON.stringify(ticket)}\nsummarize it`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [unlabeledDynamic] });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag the same region when it's wrapped in dyn()", () => {
    const prompt = t`here's the current ticket: ${dyn("ticket", { sample: JSON.stringify(ticket) })}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [unlabeledDynamic] });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a small JSON object, below the token threshold", () => {
    const report = analyze(`status: ${JSON.stringify({ ok: true })}`, {
      model: "gpt-4o",
      rules: [unlabeledDynamic],
    });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing when there's no embedded JSON", () => {
    const report = analyze("summarize the ticket below in plain prose", {
      model: "gpt-4o",
      rules: [unlabeledDynamic],
    });
    expect(report.findings).toEqual([]);
  });
});
