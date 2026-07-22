import { describe, expect, it } from "vitest";
import { resolveEncoder } from "../src/encoder.js";

describe("resolveEncoder", () => {
  it("gives an exact encoder for known OpenAI models", () => {
    const encoder = resolveEncoder("gpt-4o");
    expect(encoder.mode).toBe("exact");
    expect(encoder.family).toBe("o200k_base");
  });

  it("gives cl100k_base for gpt-4", () => {
    expect(resolveEncoder("gpt-4").family).toBe("cl100k_base");
  });

  it("throws a clear error for a claude model with no calibration data", () => {
    expect(() => resolveEncoder("claude-not-a-real-one")).toThrow(/no calibration data/);
  });

  it("throws for gemini, which isn't wired up at all", () => {
    expect(() => resolveEncoder("gemini-1.5-pro").countTokens("hi")).toThrow(/not implemented/);
  });

  it("throws for a model it's never heard of", () => {
    expect(() => resolveEncoder("not-a-real-model")).toThrow(/unknown model/);
  });
});

describe("OpenAiEncoder", () => {
  const encoder = resolveEncoder("gpt-4o");

  it("countTokens agrees with tokenize().count", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
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

  it("classifies digit runs and hex-looking runs differently from words", () => {
    const view = encoder.tokenize("order 4471 costs deadbeef tokens");
    const total = Object.values(view.stats.classHistogram).reduce((a, b) => a + b, 0);
    expect(total).toBe(view.count);
    expect(view.stats.classHistogram.word).toBeGreaterThan(0);
  });

  it("charges each line for its own tokens, not the whole prompt", () => {
    const view = encoder.tokenize("short line\na noticeably longer second line right here");
    expect(view.stats.perLineCosts).toHaveLength(2);
    expect(view.stats.perLineCosts.reduce((a, b) => a + b, 0)).toBe(view.count);
    expect(view.stats.perLineCosts[1]).toBeGreaterThan(view.stats.perLineCosts[0]!);
  });

  it("gives every line a bucket even when some are blank", () => {
    const view = encoder.tokenize("a\n\nb");
    expect(view.stats.perLineCosts).toHaveLength(3);
    expect(view.stats.perLineCosts[1]).toBe(0);
  });
});
