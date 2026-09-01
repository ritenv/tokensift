import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { AnthropicEncoder } from "../../src/encoders/anthropic.js";
import { cacheBuster } from "../../src/rules/cache-buster.js";
import { dyn, t } from "../../src/tag.js";
import type { Message } from "../../src/types.js";

const STATIC_BLOCK = "You are a careful, thorough assistant. ".repeat(320);

const CALIBRATION = {
  model: "claude-not-bundled",
  ratios: {
    word: 4,
    punct: 1,
    whitespace: 6,
    "digit-fragment": 2.5,
    "hex-fragment": 1.8,
    other: 2,
  },
  sampleCount: 1,
  measuredAt: "2026-01-01T00:00:00.000Z",
  meanAbsPercentError: 5,
};

describe("cache-buster", () => {
  it("fires when dynamic content sits before a large static block", () => {
    const prompt = t`${dyn("timestamp", { value: "2026-08-29T00:00:00Z" })}\n${STATIC_BLOCK}`;
    const report = analyze(prompt, { model: "claude-sonnet-4-5", rules: [cacheBuster] });

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.ruleId).toBe("cache-buster");
    expect(finding.severity).toBe("error");
    expect(finding.tokens.current).toBeGreaterThan(1024);
    expect(finding.tokens.saved).toBe(0);
    expect(finding.cost).toBeDefined();
    expect(finding.cost?.perCall.amount).toBeGreaterThan(0);
  });

  it("does not fire when dynamic content is placed after the static block (correct ordering)", () => {
    const prompt = t`${STATIC_BLOCK}\n${dyn("timestamp", { value: "2026-08-29T00:00:00Z" })}`;
    const report = analyze(prompt, { model: "claude-sonnet-4-5", rules: [cacheBuster] });
    expect(report.findings).toEqual([]);
  });

  it("does not fire when there are no dyn() slots at all", () => {
    const report = analyze(STATIC_BLOCK, { model: "claude-sonnet-4-5", rules: [cacheBuster] });
    expect(report.findings).toEqual([]);
  });

  it("does not fire when the lost static region is below the model's cache minimum", () => {
    const prompt = t`${dyn("id", { value: "u_123" })}\nshort static tail`;
    const report = analyze(prompt, { model: "claude-sonnet-4-5", rules: [cacheBuster] });
    expect(report.findings).toEqual([]);
  });

  it("still fires with no cost when the model has no cache-read pricing data", () => {
    const prompt = t`${dyn("id", { value: "u_123" })}\n${STATIC_BLOCK}`;
    const report = analyze(prompt, {
      model: "claude-not-bundled",
      encoder: new AnthropicEncoder("claude-not-bundled", CALIBRATION),
      rules: [cacheBuster],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.cost).toBeUndefined();
  });

  it("uses the conservative 2048-token floor for a model with no verified cache minimum", () => {
    const marginal = "word ".repeat(1200); // comfortably over claude-sonnet-4-5's 1024 floor, under 2048
    const prompt = t`${dyn("id", { value: "u_123" })}\n${marginal}`;
    const anthropicResult = analyze(prompt, { model: "claude-sonnet-4-5", rules: [cacheBuster] });
    const openaiResult = analyze(prompt, { model: "gpt-4o", rules: [cacheBuster] });
    expect(anthropicResult.findings.length).toBeGreaterThan(0);
    expect(openaiResult.findings).toEqual([]);
  });

  it("attributes the finding to the right message and rebases the slot range in Message[] input", () => {
    const built = t`${dyn("timestamp", { value: "2026-08-29T00:00:00Z" })}`;
    const messages: Message[] = [
      { role: "system", content: built.text, slots: built.slots },
      { role: "user", content: STATIC_BLOCK },
    ];
    const report = analyze(messages, { model: "claude-sonnet-4-5", rules: [cacheBuster] });

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.loc.messageIndex).toBe(0);
    const [from, to] = finding.loc.range;
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeLessThanOrEqual(built.text.length);
  });
});
