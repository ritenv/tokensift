import { describe, expect, it } from "vitest";
import { computeCost, resolvePricing } from "../src/pricing.js";

describe("resolvePricing", () => {
  it("finds a known model", () => {
    const pricing = resolvePricing("gpt-4o");
    expect(pricing?.provider).toBe("openai");
    expect(pricing?.inputCostPerToken).toBeGreaterThan(0);
  });

  it("returns undefined for a model with no pricing data", () => {
    expect(resolvePricing("not-a-real-model")).toBeUndefined();
  });
});

describe("computeCost", () => {
  it("returns undefined when there's no pricing data for the model", () => {
    expect(computeCost(100, "not-a-real-model")).toBeUndefined();
  });

  it("computes perCall from tokensSaved * inputCostPerToken", () => {
    const pricing = resolvePricing("gpt-4o")!;
    const cost = computeCost(100, "gpt-4o");
    expect(cost?.perCall.amount).toBeCloseTo(100 * pricing.inputCostPerToken);
    expect(cost?.perCall.currency).toBe("USD");
  });

  it("has no atVolume when no volume is given", () => {
    const cost = computeCost(100, "gpt-4o");
    expect(cost?.atVolume).toBeUndefined();
  });

  it("always computes per1000Calls as perCall * 1000, regardless of volume", () => {
    const cost = computeCost(100, "gpt-4o");
    expect(cost?.per1000Calls.amount).toBeCloseTo(cost!.perCall.amount * 1000);
    expect(cost?.per1000Calls.currency).toBe("USD");
  });

  it("projects atVolume from requestsPerDay", () => {
    const pricing = resolvePricing("gpt-4o")!;
    const cost = computeCost(100, "gpt-4o", { requestsPerDay: 1000 });
    expect(cost?.atVolume?.amount).toBeCloseTo(100 * pricing.inputCostPerToken * 1000 * 30);
  });

  it("projects atVolume from requestsPerMonth directly", () => {
    const pricing = resolvePricing("gpt-4o")!;
    const cost = computeCost(100, "gpt-4o", { requestsPerMonth: 5000 });
    expect(cost?.atVolume?.amount).toBeCloseTo(100 * pricing.inputCostPerToken * 5000);
  });

  it("prefers requestsPerMonth when both are given", () => {
    const pricing = resolvePricing("gpt-4o")!;
    const cost = computeCost(100, "gpt-4o", { requestsPerDay: 1, requestsPerMonth: 5000 });
    expect(cost?.atVolume?.amount).toBeCloseTo(100 * pricing.inputCostPerToken * 5000);
  });

  it("uses an override's inputPerMTok instead of the bundled price", () => {
    const cost = computeCost(100, "gpt-4o", undefined, { "gpt-4o": { inputPerMTok: 1 } });
    expect(cost?.perCall.amount).toBeCloseTo(100 * (1 / 1_000_000));
  });

  it("synthesizes a full row from an override for a model with no bundled data", () => {
    const pricing = resolvePricing("my-custom-model", {
      "my-custom-model": { inputPerMTok: 2, outputPerMTok: 4, cacheReadPerMTok: 0.2 },
    });
    expect(pricing?.provider).toBe("custom");
    expect(pricing?.inputCostPerToken).toBeCloseTo(2 / 1_000_000);
    expect(pricing?.outputCostPerToken).toBeCloseTo(4 / 1_000_000);
    expect(pricing?.cacheReadInputCostPerToken).toBeCloseTo(0.2 / 1_000_000);
  });

  it("falls back to the bundled outputPerMTok when an override only sets inputPerMTok", () => {
    const base = resolvePricing("gpt-4o")!;
    const pricing = resolvePricing("gpt-4o", { "gpt-4o": { inputPerMTok: 1 } });
    expect(pricing?.outputCostPerToken).toBe(base.outputCostPerToken);
  });
});
