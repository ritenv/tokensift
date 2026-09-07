import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { belowCacheMinimum } from "../../src/rules/below-cache-minimum.js";
import { dyn, t } from "../../src/tag.js";
import type { Message } from "../../src/types.js";

const LARGE_PREFIX = "You are a careful, thorough assistant. ".repeat(320);

describe("below-cache-minimum", () => {
  it("fires when the static prefix is shorter than the model's cache minimum", () => {
    const prompt = t`Hello.\n${dyn("id", { value: "u_123" })}`;
    const report = analyze(prompt, { model: "claude-sonnet-4-5", rules: [belowCacheMinimum] });

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.ruleId).toBe("below-cache-minimum");
    expect(finding.severity).toBe("info");
    expect(finding.tokens.current).toBeGreaterThan(0);
    expect(finding.tokens.saved).toBe(0);
  });

  it("does not fire when the static prefix already clears the cache minimum", () => {
    const prompt = t`${LARGE_PREFIX}\n${dyn("id", { value: "u_123" })}`;
    const report = analyze(prompt, { model: "claude-sonnet-4-5", rules: [belowCacheMinimum] });
    expect(report.findings).toEqual([]);
  });

  it("does not fire when there are no dyn() slots at all", () => {
    const report = analyze("Hello.", { model: "claude-sonnet-4-5", rules: [belowCacheMinimum] });
    expect(report.findings).toEqual([]);
  });

  it("does not fire when the dynamic slot is the very first thing, no prefix to measure", () => {
    const prompt = t`${dyn("id", { value: "u_123" })}\nsome text after`;
    const report = analyze(prompt, { model: "claude-sonnet-4-5", rules: [belowCacheMinimum] });
    expect(report.findings).toEqual([]);
  });

  it("uses the model's real verified minimum, not a hardcoded universal one", () => {
    // 1024-1600ish tokens: over claude-sonnet-4-5's real 1024 minimum, under the 2048 floor
    // used for models with no verified minimum (all currently-bundled OpenAI models)
    const marginal = "word ".repeat(1200);
    const prompt = t`${marginal}\n${dyn("id", { value: "u_123" })}`;

    const anthropicResult = analyze(prompt, {
      model: "claude-sonnet-4-5",
      rules: [belowCacheMinimum],
    });
    const openaiResult = analyze(prompt, { model: "gpt-4o", rules: [belowCacheMinimum] });

    expect(anthropicResult.findings).toEqual([]);
    expect(openaiResult.findings).toHaveLength(1);
  });

  it("attributes the finding to the right message in Message[] input", () => {
    const built = t`Hi.\n${dyn("id", { value: "u_123" })}`;
    const messages: Message[] = [
      { role: "system", content: built.text, slots: built.slots },
      { role: "user", content: "hello" },
    ];
    const report = analyze(messages, { model: "claude-sonnet-4-5", rules: [belowCacheMinimum] });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.loc.messageIndex).toBe(0);
  });
});
