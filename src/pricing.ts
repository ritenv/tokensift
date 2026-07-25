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

// Prices as a user would naturally type them (dollars per million tokens),
// converted to per-token internally. Matches spec §9's config example.
export interface PricingOverride {
  inputPerMTok: number;
  outputPerMTok?: number;
  cacheReadPerMTok?: number;
}

const PER_MILLION = 1_000_000;

function fromOverride(model: string, override: PricingOverride, base?: PricingRow): PricingRow {
  return {
    model,
    provider: base?.provider ?? "custom",
    inputCostPerToken: override.inputPerMTok / PER_MILLION,
    outputCostPerToken:
      override.outputPerMTok !== undefined
        ? override.outputPerMTok / PER_MILLION
        : (base?.outputCostPerToken ?? 0),
    ...(override.cacheReadPerMTok !== undefined
      ? { cacheReadInputCostPerToken: override.cacheReadPerMTok / PER_MILLION }
      : base?.cacheReadInputCostPerToken !== undefined
        ? { cacheReadInputCostPerToken: base.cacheReadInputCostPerToken }
        : {}),
  };
}

export function resolvePricing(
  model: string,
  overrides?: Record<string, PricingOverride>,
): PricingRow | undefined {
  const base = PRICING_DATA[model];
  const override = overrides?.[model];
  if (override) return fromOverride(model, override, base);
  return base;
}

function requestsPerMonth(volume: VolumeOptions): number | undefined {
  if (volume.requestsPerMonth !== undefined) return volume.requestsPerMonth;
  if (volume.requestsPerDay !== undefined) return volume.requestsPerDay * 30;
  return undefined;
}

const PER_1000_CALLS = 1000;

export function computeCost(
  tokensSaved: number,
  model: string,
  volume?: VolumeOptions,
  overrides?: Record<string, PricingOverride>,
): { perCall: Money; per1000Calls: Money; atVolume?: Money } | undefined {
  const pricing = resolvePricing(model, overrides);
  if (!pricing) return undefined;

  const perCallAmount = tokensSaved * pricing.inputCostPerToken;
  const perCall: Money = { amount: perCallAmount, currency: "USD" };
  const per1000Calls: Money = { amount: perCallAmount * PER_1000_CALLS, currency: "USD" };

  if (!volume) return { perCall, per1000Calls };

  const monthly = requestsPerMonth(volume);
  if (monthly === undefined) return { perCall, per1000Calls };

  return { perCall, per1000Calls, atVolume: { amount: perCallAmount * monthly, currency: "USD" } };
}
