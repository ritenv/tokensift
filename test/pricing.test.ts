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
});
