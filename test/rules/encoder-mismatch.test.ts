import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { AnthropicEncoder } from "../../src/encoders/anthropic.js";
import { Cl100kBaseEncoder } from "../../src/encoders/openai-cl100k.js";
import { O200kBaseEncoder } from "../../src/encoders/openai-o200k.js";
import { encoderMismatch } from "../../src/rules/encoder-mismatch.js";

const calibration = {
  model: "claude-custom",
  ratios: {
    word: 4,
    punct: 1,
    whitespace: 6,
    "digit-fragment": 2.5,
    "hex-fragment": 1.8,
    other: 2,
  },
  sampleCount: 30,
  measuredAt: "2026-01-01T00:00:00.000Z",
  meanAbsPercentError: 4.2,
};

describe("encoder-mismatch", () => {
  it("does not fire on the normal path, no explicit encoder override", () => {
    const report = analyze("hello world", { model: "gpt-4o", rules: [encoderMismatch] });
    expect(report.findings).toEqual([]);
  });

  it("does not fire when an explicit encoder's family agrees with the model", () => {
    const report = analyze("hello world", {
      model: "gpt-4o",
      encoder: new O200kBaseEncoder("gpt-4o"),
      rules: [encoderMismatch],
    });
    expect(report.findings).toEqual([]);
  });

  it("fires when an explicit encoder's family disagrees with the model", () => {
    const report = analyze("hello world", {
      model: "gpt-4",
      encoder: new O200kBaseEncoder("gpt-4o"),
      rules: [encoderMismatch],
    });
    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.message).toContain("cl100k_base");
    expect(finding.message).toContain("o200k_base");
    expect(finding.tokens.saved).toBe(0);
  });

  it("fires across providers too (anthropic encoder against an openai model string)", () => {
    const report = analyze("hello world", {
      model: "gpt-4o",
      encoder: new AnthropicEncoder("claude-custom", calibration),
      rules: [encoderMismatch],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.message).toContain("anthropic");
  });

  it("does not fire when the model string doesn't resolve on its own (a locally-calibrated model resolveEncoder doesn't know about)", () => {
    const report = analyze("hello world", {
      model: "claude-not-bundled",
      encoder: new AnthropicEncoder("claude-not-bundled", calibration),
      rules: [encoderMismatch],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not fire against Cl100kBaseEncoder when the model genuinely is cl100k_base", () => {
    const report = analyze("hello world", {
      model: "gpt-4",
      encoder: new Cl100kBaseEncoder("gpt-4"),
      rules: [encoderMismatch],
    });
    expect(report.findings).toEqual([]);
  });
});
