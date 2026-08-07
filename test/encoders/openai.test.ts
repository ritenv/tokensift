import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { Cl100kBaseEncoder } from "../../src/encoders/openai-cl100k.js";
import { O200kBaseEncoder } from "../../src/encoders/openai-o200k.js";
import { OpenAiEncoder } from "../../src/encoders/openai.js";

const text = "order 4471 costs deadbeef tokens, roughly.";

describe("O200kBaseEncoder / Cl100kBaseEncoder", () => {
  it("O200kBaseEncoder matches OpenAiEncoder for an o200k_base model", () => {
    const direct = new O200kBaseEncoder("gpt-4o");
    const viaFamily = new OpenAiEncoder("gpt-4o");
    expect(direct.countTokens(text)).toBe(viaFamily.countTokens(text));
    expect(direct.tokenize(text)).toEqual(viaFamily.tokenize(text));
    expect(direct.family).toBe("o200k_base");
    expect(direct.mode).toBe("exact");
  });

  it("Cl100kBaseEncoder matches OpenAiEncoder for a cl100k_base model", () => {
    const direct = new Cl100kBaseEncoder("gpt-4");
    const viaFamily = new OpenAiEncoder("gpt-4");
    expect(direct.countTokens(text)).toBe(viaFamily.countTokens(text));
    expect(direct.tokenize(text)).toEqual(viaFamily.tokenize(text));
    expect(direct.family).toBe("cl100k_base");
    expect(direct.mode).toBe("exact");
  });

  it("the two families disagree on at least some real text (sanity check they're not the same table)", () => {
    const o200k = new O200kBaseEncoder("gpt-4o");
    const cl100k = new Cl100kBaseEncoder("gpt-4");
    expect(o200k.tokenize(text).tokens.map((t) => t.id)).not.toEqual(
      cl100k.tokenize(text).tokens.map((t) => t.id),
    );
  });

  it("analyze() accepts a directly-constructed per-family encoder via options.encoder, bypassing resolveEncoder", () => {
    const report = analyze("a plain prompt with no waste", {
      model: "gpt-4o",
      encoder: new O200kBaseEncoder("gpt-4o"),
      rules: [],
    });
    expect(report.summary.totalTokens).toBeGreaterThan(0);
  });
});
