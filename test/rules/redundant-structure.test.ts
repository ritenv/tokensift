import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { redundantStructure } from "../../src/rules/redundant-structure.js";

const order = { id: "ORD-4471", status: "shipped", total: 129.99 };

describe("redundant-structure", () => {
  it("flags a JSON blob pasted twice in the same prompt", async () => {
    const prompt = `Order details:\n${JSON.stringify(order)}\n\nConfirm this matches the order:\n${JSON.stringify(order)}`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.tokens.saved).toBeGreaterThan(0);
  });

  it("flags the same data reformatted, pretty-printed once and minified once", async () => {
    const prompt = `Order details:\n${JSON.stringify(order, null, 2)}\n\nConfirm this matches the order:\n${JSON.stringify(order)}`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toHaveLength(1);
  });

  it("does not flag two different JSON blobs", async () => {
    const other = { id: "ORD-9982", status: "pending", total: 45.0 };
    const prompt = `${JSON.stringify(order)}\n${JSON.stringify(other)}`;
    const report = await analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing with a single JSON blob", async () => {
    const report = await analyze(JSON.stringify(order), {
      model: "gpt-4o",
      rules: [redundantStructure],
    });
    expect(report.findings).toEqual([]);
  });

  it("flags the same data duplicated with reordered object keys", async () => {
    const prompt = 'First: {"a":1,"b":2,"c":3}\nSecond: {"c":3,"b":2,"a":1}';
    const report = await analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toHaveLength(1);
  });

  it("flags reordered keys at a nested level too", async () => {
    const prompt = 'First: {"a":1,"nested":{"x":1,"y":2}}\nSecond: {"nested":{"y":2,"x":1},"a":1}';
    const report = await analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toHaveLength(1);
  });

  it("does not treat reordered array elements as duplicates, array order is meaningful", async () => {
    const prompt = "First: [1,2,3]\nSecond: [3,2,1]";
    const report = await analyze(prompt, { model: "gpt-4o", rules: [redundantStructure] });
    expect(report.findings).toEqual([]);
  });
});
