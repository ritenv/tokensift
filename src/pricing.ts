import { PRICING_DATA } from "./pricing-data.js";
import type { Money } from "./types.js";

export interface PricingRow {
  model: string;
  provider: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheReadInputCostPerToken?: number;
}

export interface VolumeOptions {
  requestsPerDay?: number;
  requestsPerMonth?: number;
}

export function resolvePricing(model: string): PricingRow | undefined {
  return PRICING_DATA[model];
}

function requestsPerMonth(volume: VolumeOptions): number | undefined {
  if (volume.requestsPerMonth !== undefined) return volume.requestsPerMonth;
  if (volume.requestsPerDay !== undefined) return volume.requestsPerDay * 30;
  return undefined;
}

export function computeCost(
  tokensSaved: number,
  model: string,
  volume?: VolumeOptions,
): { perCall: Money; atVolume?: Money } | undefined {
  const pricing = resolvePricing(model);
  if (!pricing) return undefined;

  const perCallAmount = tokensSaved * pricing.inputCostPerToken;
  const perCall: Money = { amount: perCallAmount, currency: "USD" };

  if (!volume) return { perCall };

  const monthly = requestsPerMonth(volume);
  if (monthly === undefined) return { perCall };

  return { perCall, atVolume: { amount: perCallAmount * monthly, currency: "USD" } };
}
