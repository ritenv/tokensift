import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { highEntropyString } from "../../src/rules/high-entropy-string.js";

describe("high-entropy-string", () => {
  it("flags a github token and calls out that it looks like a credential", () => {
    const report = analyze("use this token: ghp_16C7e42F292c6912E7710c838347Ae178B4a", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).toContain("credential");
  });

  it("flags a random cache key without the credential note", () => {
    const report = analyze("cache_key_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c holds the result", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).not.toContain("credential");
  });

  it("does not flag a long but ordinary camelCase identifier", () => {
    const report = analyze("call internationalizationSettingsManager to load locale data", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a canonical UUID, that's uuid-bloat's job", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag ordinary prose", () => {
    const report = analyze("summarize the attached document in three bullet points", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toEqual([]);
  });
});
