import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { uuidBloat } from "../../src/rules/uuid-bloat.js";

const fixturePath = fileURLToPath(
  new URL("../fixtures/uuid-bloat/support-ticket.txt", import.meta.url),
);
const supportTicket = readFileSync(fixturePath, "utf8");

describe("uuid-bloat", () => {
  it("flags standalone UUIDs regardless of case", () => {
    const report = analyze(supportTicket, { model: "gpt-4o", rules: [uuidBloat] });
    const messages = report.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("550e8400-e29b-41d4-a716-446655440000"))).toBe(true);
    expect(messages.some((m) => m.includes("6BA7B810-9DAD-11D1-80B4-00C04FD430C8"))).toBe(true);
  });

  it("flags a UUID sitting inside a JSON value", () => {
    const report = analyze(supportTicket, { model: "gpt-4o", rules: [uuidBloat] });
    const messages = report.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("16fd2706-8baf-433b-82eb-8c7fabcae1f1"))).toBe(true);
  });

  it("does not flag order/invoice ids that merely contain dashes and digits", () => {
    const report = analyze(supportTicket, { model: "gpt-4o", rules: [uuidBloat] });
    const messages = report.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("ORD-4471"))).toBe(false);
    expect(messages.some((m) => m.includes("INV-2024-08"))).toBe(false);
  });

  it("reports the UUID's real token cost and a cheaper alternative", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.confidence).toBe("exact");
    expect(finding.tokens.current).toBeGreaterThan(finding.tokens.afterFix);
    expect(finding.tokens.saved).toBe(finding.tokens.current - finding.tokens.afterFix);
  });

  it("finds nothing in a UUID-free prompt", () => {
    const report = analyze("summarize the attached document in three bullet points", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    expect(report.findings).toEqual([]);
  });

  it("flags a UUID immediately adjacent to underscores", () => {
    const report = analyze("trace_550e8400-e29b-41d4-a716-446655440000_end", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.message).toContain("550e8400-e29b-41d4-a716-446655440000");
  });

  it("suggests the same short id for every occurrence of the same repeated UUID", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const report = analyze(`id: ${uuid} again: ${uuid} and: ${uuid}`, {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    expect(report.findings).toHaveLength(3);
    const suggestions = report.findings.map((f) => f.suggestion);
    expect(new Set(suggestions).size).toBe(1);
    expect(suggestions[0]).toContain("id-1");
  });

  it("assigns a different short id to a genuinely different UUID", () => {
    const uuidA = "550e8400-e29b-41d4-a716-446655440000";
    const uuidB = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    const report = analyze(`first: ${uuidA} second: ${uuidB} first again: ${uuidA}`, {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    expect(report.findings).toHaveLength(3);
    expect(report.findings[0]?.suggestion).toContain("id-1");
    expect(report.findings[1]?.suggestion).toContain("id-2");
    expect(report.findings[2]?.suggestion).toContain("id-1");
  });
});
