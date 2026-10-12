import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { verboseSchemaValues } from "../../src/rules/verbose-schema-values.js";

const statuses = [
  "STATUS_ACTIVE",
  "STATUS_INACTIVE",
  "STATUS_PENDING",
  "STATUS_ACTIVE",
  "STATUS_CHURNED",
  "STATUS_ACTIVE",
  "STATUS_PENDING",
  "STATUS_INACTIVE",
];
const rows = statuses.map((s, i) => ({ id: i, status: s }));

describe("verbose-schema-values", () => {
  it("flags a repeated enum-style prefix across rows", async () => {
    const report = await analyze(JSON.stringify(rows), {
      model: "gpt-4o",
      rules: [verboseSchemaValues],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).toContain("STATUS_");
  });

  it("does not flag values with no shared prefix", async () => {
    const noPrefix = ["open", "closed", "pending", "open"].map((s, i) => ({ id: i, status: s }));
    const report = await analyze(JSON.stringify(noPrefix), {
      model: "gpt-4o",
      rules: [verboseSchemaValues],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a column that's all the same value", async () => {
    const sameValue = [1, 2, 3].map((id) => ({ id, status: "STATUS_ACTIVE" }));
    const report = await analyze(JSON.stringify(sameValue), {
      model: "gpt-4o",
      rules: [verboseSchemaValues],
    });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing when there's no embedded JSON", async () => {
    const report = await analyze("summarize the ticket below in plain prose", {
      model: "gpt-4o",
      rules: [verboseSchemaValues],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a purely character-level accidental prefix with no real word/enum boundary", async () => {
    const labels = ["APPROVED", "APPROXIMATELY_DONE", "APPROXIMATE_MATCH"].map((s, i) => ({
      id: i,
      label: s,
    }));
    const report = await analyze(JSON.stringify(labels), {
      model: "gpt-4o",
      rules: [verboseSchemaValues],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a column where one value is identical to the shared prefix itself", async () => {
    // would otherwise suggest collapsing "STATUS" to an empty-string suffix
    const values = ["STATUS", "STATUS_ACTIVE", "STATUS_INACTIVE"].map((s, i) => ({
      id: i,
      status: s,
    }));
    const report = await analyze(JSON.stringify(values), {
      model: "gpt-4o",
      rules: [verboseSchemaValues],
    });
    expect(report.findings).toEqual([]);
  });
});
