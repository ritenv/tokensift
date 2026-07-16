import { describe, expect, it } from "vitest";
import { createLinter, defineConfig } from "../src/config.js";

describe("createLinter", () => {
  it("runs the built-in rules by default", () => {
    const linter = createLinter(defineConfig({ model: "gpt-4o" }));
    const report = linter.analyze("id: 550e8400-e29b-41d4-a716-446655440000");
    expect(report.findings.some((f) => f.ruleId === "uuid-bloat")).toBe(true);
  });

  it("turns a rule off via config", () => {
    const linter = createLinter(defineConfig({ model: "gpt-4o", rules: { "uuid-bloat": "off" } }));
    const report = linter.analyze("id: 550e8400-e29b-41d4-a716-446655440000");
    expect(report.findings).toEqual([]);
  });

  it("overrides a rule's severity via config", () => {
    const linter = createLinter(
      defineConfig({ model: "gpt-4o", rules: { "uuid-bloat": "error" } }),
    );
    const report = linter.analyze("id: 550e8400-e29b-41d4-a716-446655440000");
    expect(report.findings[0]?.severity).toBe("error");
  });

  it("turns off autofix via config", () => {
    const linter = createLinter(defineConfig({ model: "gpt-4o", autofix: false }));
    const report = linter.analyze('the customer said "it’s broken"');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.fix === undefined)).toBe(true);
  });
});
