import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { redundantStructure } from "../../src/rules/redundant-structure.js";

const order = { id: "ORD-4471", status: "shipped", total: 129.99 };

describe("redundant-structure", () => {
  it("flags a JSON blob pasted twice in the same prompt", () => {
    const prompt = `Order details:\n${JSON.stringify(order)}\n\nConfirm this matches the order:\n${JSON.stringify(order)}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.tokens.saved).toBeGreaterThan(0);
  });

  it("flags the same data reformatted, pretty-printed once and minified once", () => {
    const prompt = `Order details:\n${JSON.stringify(order, null, 2)}\n\nConfirm this matches the order:\n${JSON.stringify(order)}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag two different JSON blobs", () => {
    const other = { id: "ORD-9982", status: "pending", total: 45.0 };
    const prompt = `${JSON.stringify(order)}\n${JSON.stringify(other)}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing with a single JSON blob", () => {
    const report = analyze(JSON.stringify(order), { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toEqual([]);
  });
});
