import { describe, expect, it } from "vitest";
import { createLinter, defineConfig } from "../src/config.js";
import { defineRule } from "../src/rule.js";

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
    const report = linter.analyze("the customer said hello​world");
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((f) => f.fix === undefined)).toBe(true);
  });

  it("runs a custom rule alongside the builtins", () => {
    const flagsShout = defineRule({
      id: "flags-shout",
      defaultSeverity: "info",
      why: "test fixture rule",
      check(ctx, severity) {
        if (!ctx.text.includes("SHOUT")) return [];
        const start = ctx.text.indexOf("SHOUT");
        return [
          {
            ruleId: "flags-shout",
            severity,
            message: "found SHOUT",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [start, start + 5] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            confidence: "exact",
          },
        ];
      },
    });

    const linter = createLinter(defineConfig({ model: "gpt-4o", customRules: [flagsShout] }));
    const report = linter.analyze("SHOUT about id 550e8400-e29b-41d4-a716-446655440000");

    expect(report.findings.some((f) => f.ruleId === "flags-shout")).toBe(true);
    // builtins still run alongside it, custom rules are additive, not a replacement
    expect(report.findings.some((f) => f.ruleId === "uuid-bloat")).toBe(true);
  });

  it("applies rules-based severity overrides to a custom rule by id, same as a builtin", () => {
    const flagsShout = defineRule({
      id: "flags-shout",
      defaultSeverity: "info",
      why: "test fixture rule",
      check(ctx, severity) {
        return [
          {
            ruleId: "flags-shout",
            severity,
            message: "found SHOUT",
            why: "test fixture rule",
            loc: { input: ctx.inputRef, range: [0, 5] },
            tokens: { current: 1, afterFix: 1, saved: 0 },
            confidence: "exact",
          },
        ];
      },
    });

    const linter = createLinter(
      defineConfig({
        model: "gpt-4o",
        customRules: [flagsShout],
        rules: { "flags-shout": "error" },
      }),
    );
    const report = linter.analyze("SHOUT");
    expect(report.findings[0]?.severity).toBe("error");
  });

  it("threads a per-call path override into loc.input.path", () => {
    const linter = createLinter(defineConfig({ model: "gpt-4o" }));
    const report = linter.analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      path: "prompts/support.md",
    });
    expect(report.findings[0]?.loc.input.path).toBe("prompts/support.md");
  });
});
