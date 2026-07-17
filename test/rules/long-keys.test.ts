import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { longKeys } from "../../src/rules/long-keys.js";

const statuses = ["ACTIVE", "CHURNED", "ACTIVE", "TRIAL", "ACTIVE", "CHURNED", "TRIAL", "ACTIVE"];
const rows = statuses.map((s, i) => ({
  customer_lifetime_value_usd: 100 * (i + 1),
  subscription_status_code: s,
  account_manager_email_address: `manager${i}@example.com`,
}));

describe("long-keys", () => {
  it("flags a bulk data array with long, descriptive keys", () => {
    const report = analyze(JSON.stringify(rows), { model: "gpt-4o", rules: [longKeys] });
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.tokens.current).toBeGreaterThan(finding.tokens.afterFix);
    expect(finding.message).toContain("8 rows");
  });

  it("does not flag an array with short keys", () => {
    const shortRows = statuses.map((s, i) => ({ id: i, status: s }));
    const report = analyze(JSON.stringify(shortRows), { model: "gpt-4o", rules: [longKeys] });
    expect(report.findings).toEqual([]);
  });

  it("finds nothing when there's no embedded JSON", () => {
    const report = analyze("summarize the ticket below in plain prose", {
      model: "gpt-4o",
      rules: [longKeys],
    });
    expect(report.findings).toEqual([]);
  });
});
