import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { highEntropyString } from "../../src/rules/high-entropy-string.js";

// required by gh push protection to split the key, so these don't get detected as live api keys (they aren't)
const ghp = "ghp";
const ghpVal = "16C7e42F292c6912E7710c838347Ae178B4a";
const cacheKey = "cache_key";
const cacheKeyVal = "16C7e42F292c6912E7710c838347Ae178B4a";

describe("high-entropy-string", () => {
  it("flags a github token and calls out that it looks like a credential", () => {
    const report = analyze(`use this token: ${ghp}_${ghpVal}`, {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).toContain("credential");
  });

  it("flags a random cache key without the credential note", () => {
    const report = analyze(`${cacheKey}_${cacheKeyVal} holds the result`, {
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

  it("flags a credential-prefixed string even when it tokenizes efficiently enough to clear the entropy gate on its own", () => {
    // required by gh push protection to split the key, so it doesn't get detected as a live api key (it isn't)
    const tokenValue = "q7m2k9x4p1v8r3n6t0w5y2c8j4h1s9d6f3g0a7z5l2b";
    const slackValue = "q7m2k9x4p1v8r3n6t0w5y2c8j4h1s9d6f3g0a7z5";
    const googleValue = "AIzaq7m2k9x4p1v8r3n6t0w5y2c8j4h1s9d6f3g0a7z5l2b9e6";
    const cases = [
      `token: ghp_${tokenValue}`,
      `slack: xoxb-${slackValue}`,
      `google: ${googleValue}`,
    ];
    for (const text of cases) {
      const report = analyze(text, { model: "gpt-4o", rules: [highEntropyString] });
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]?.message).toContain("credential");
    }
  });

  it("recognizes npm, GitHub fine-grained PAT, and Stripe restricted key prefixes", () => {
    // required by gh push protection to split the key, so it doesn't get detected as a live api key (it isn't)
    const stripeKey = "q7m2k9x4p1v8r3n6t0w5y2c8j4h1s9d6f3g0a7z5";
    const cases = [
      "npm_config: npm_q7m2k9x4p1v8r3n6t0w5y2c8j4h1s9d6f3g0a7z5",
      "token: github_pat_q7m2k9x4p1v8r3n6t0w5y2c8j4h1s9d6f3g0a7z5l2b9e6",
      `stripe: rk_live_${stripeKey}`,
    ];
    for (const text of cases) {
      const report = analyze(text, { model: "gpt-4o", rules: [highEntropyString] });
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]?.message).toContain("credential");
    }
  });

  it("still does not flag snake_case identifiers after the credential-prefix bypass was added", () => {
    const report = analyze("the_quick_brown_fox_jumps_over_the_lazy_dog_variable_name is unused", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a SCREAMING_SNAKE_CASE enum/status value", () => {
    const report = analyze("stage: PAYMENT_PROCESSING_FAILED_AWAITING_MANUAL_REVIEW", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toEqual([]);
  });

  it("still flags a credential-prefixed value even if it happens to be all-caps snake case", () => {
    const report = analyze("token: AKIA_Q7M2K9X4P1V8R3N6T0W5Y2C8J4H1S9D6F3G0A7Z5", {
      model: "gpt-4o",
      rules: [highEntropyString],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.message).toContain("credential");
  });
});
