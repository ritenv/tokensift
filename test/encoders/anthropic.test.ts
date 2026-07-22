import { describe, expect, it } from "vitest";
import {
  type AnthropicCalibration,
  AnthropicEncoder,
  segmentByClass,
} from "../../src/encoders/anthropic.js";

const calibration: AnthropicCalibration = {
  model: "claude-test",
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

describe("segmentByClass", () => {
  it("splits mixed text into class runs that reassemble the original", () => {
    const text = "order 4471 costs deadbeef tokens.";
    const runs = segmentByClass(text);
    expect(runs.map((r) => r.text).join("")).toBe(text);
  });

  it("classifies a pure digit run as digit-fragment", () => {
    const runs = segmentByClass("4471");
    expect(runs).toEqual([{ class: "digit-fragment", text: "4471" }]);
  });

  it("classifies a hex-looking run with letters as hex-fragment", () => {
    const runs = segmentByClass("deadbeef");
    expect(runs).toEqual([{ class: "hex-fragment", text: "deadbeef" }]);
  });

  it("classifies plain letters as word", () => {
    const runs = segmentByClass("hello");
    expect(runs).toEqual([{ class: "word", text: "hello" }]);
  });

  it("classifies whitespace and punctuation separately", () => {
    const runs = segmentByClass("a, b");
    expect(runs).toEqual([
      { class: "word", text: "a" },
      { class: "punct", text: "," },
      { class: "whitespace", text: " " },
      { class: "word", text: "b" },
    ]);
  });
});

describe("AnthropicEncoder", () => {
  const encoder = new AnthropicEncoder("claude-test", calibration);

  it("has estimate mode and anthropic family", () => {
    expect(encoder.mode).toBe("estimate");
    expect(encoder.family).toBe("anthropic");
  });

  it("countTokens agrees with tokenize().count", () => {
    const text = "order 4471 costs deadbeef tokens, roughly.";
    expect(encoder.countTokens(text)).toBe(encoder.tokenize(text).count);
  });

  it("byte ranges are contiguous and cover the whole string", () => {
    const text = "café ☕ costs 5 tokens, roughly";
    const view = encoder.tokenize(text);
    const totalBytes = new TextEncoder().encode(text).length;

    expect(view.tokens[0]?.byteRange[0]).toBe(0);
    expect(view.tokens.at(-1)?.byteRange[1]).toBe(totalBytes);
    for (let i = 1; i < view.tokens.length; i++) {
      expect(view.tokens[i]?.byteRange[0]).toBe(view.tokens[i - 1]?.byteRange[1]);
    }
  });

  it("classHistogram sums to the total token count", () => {
    const view = encoder.tokenize("order 4471 costs deadbeef tokens, roughly.");
    const total = Object.values(view.stats.classHistogram).reduce((a, b) => a + b, 0);
    expect(total).toBe(view.count);
  });

  it("returns zero tokens for empty input", () => {
    expect(encoder.countTokens("")).toBe(0);
  });

  it("charges more tokens to a longer run of the same class", () => {
    const short = encoder.countTokens("hello");
    const long = encoder.countTokens("hello world this is a much longer sentence");
    expect(long).toBeGreaterThan(short);
  });
});
