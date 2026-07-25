import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PricingOverride } from "../pricing.js";

// CLI-only: a local .tokensift/pricing-overrides.json (written by hand, or by
// `tokensift pricing update`) overrides the bundled pricing snapshot per exact
// model id, via AnalyzeOptions.pricingOverrides, without touching the bundled
// default. Same override pattern as calibration-override.ts.
export function loadPricingOverrides(
  cwd: string,
  explicitPath?: string,
): Record<string, PricingOverride> | undefined {
  const path = explicitPath ?? join(cwd, ".tokensift", "pricing-overrides.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, PricingOverride>;
}
