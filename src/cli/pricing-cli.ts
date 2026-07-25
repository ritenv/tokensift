import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PRICING_DATA } from "../pricing-data.js";
import type { PricingOverride } from "../pricing.js";
import { resolvePricing } from "../pricing.js";
import { requireValue } from "./args.js";
import { loadPricingOverrides } from "./pricing-override.js";
import type { RunResult } from "./types.js";

const LITELLM_SOURCE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const PER_MILLION = 1_000_000;

interface PricingShowOptions {
  model?: string;
  pricingFile?: string;
}

function parsePricingShowArgs(argv: string[]): PricingShowOptions {
  let model: string | undefined;
  let pricingFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--pricing-file") {
      pricingFile = requireValue(argv, ++i, "--pricing-file");
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    model = arg;
  }
  return { model, pricingFile };
}

function perMillion(perToken: number): number {
  return perToken * PER_MILLION;
}

export async function runPricingShow(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parsePricingShowArgs(argv);
    if (!options.model) {
      throw new Error("usage: tokensift pricing show <model>");
    }

    const overrides = loadPricingOverrides(cwd, options.pricingFile);
    const pricing = resolvePricing(options.model, overrides);
    if (!pricing) {
      const known = Object.keys(PRICING_DATA);
      throw new Error(
        `no pricing data for '${options.model}'; known models: ${known.join(", ")}. Add one to .tokensift/pricing-overrides.json or run \`tokensift pricing update\``,
      );
    }

    const source = overrides?.[options.model] ? "local override" : "bundled";
    const lines = [
      `${options.model} (${pricing.provider}, ${source})`,
      `  input:  $${perMillion(pricing.inputCostPerToken).toFixed(4)} / 1M tokens`,
      `  output: $${perMillion(pricing.outputCostPerToken).toFixed(4)} / 1M tokens`,
    ];
    if (pricing.cacheReadInputCostPerToken !== undefined) {
      lines.push(
        `  cache read: $${perMillion(pricing.cacheReadInputCostPerToken).toFixed(4)} / 1M tokens`,
      );
    }

    return { exitCode: 0, output: lines.join("\n") };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}

interface PricingUpdateOptions {
  out?: string;
}

function parsePricingUpdateArgs(argv: string[]): PricingUpdateOptions {
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--out") {
      out = requireValue(argv, ++i, "--out");
      continue;
    }
    throw new Error(`unknown flag '${arg}'`);
  }
  return { out };
}

// The only other network call in this codebase besides `calibrate anthropic
// run`, and the same policy applies: strictly opt-in, never invoked by
// analyze/check/any auto-discovery. Refreshes prices for the models this
// package already ships bundled data for (Object.keys(PRICING_DATA)), not an
// open-ended set, since those are the only ones tokensift resolves an encoder
// for. Writes a local override file rather than touching the installed
// package, same mechanism `calibrate anthropic run` uses for calibration.
export async function runPricingUpdate(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parsePricingUpdateArgs(argv);

    const res = await fetch(LITELLM_SOURCE_URL);
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    const raw = (await res.json()) as Record<string, Record<string, unknown>>;

    const overrides: Record<string, PricingOverride> = {};
    const missing: string[] = [];
    for (const model of Object.keys(PRICING_DATA)) {
      const entry = raw[model];
      const inputCostPerToken = entry?.input_cost_per_token;
      if (typeof inputCostPerToken !== "number") {
        missing.push(model);
        continue;
      }
      const outputCostPerToken = entry?.output_cost_per_token;
      const cacheReadInputTokenCost = entry?.cache_read_input_token_cost;
      overrides[model] = {
        inputPerMTok: perMillion(inputCostPerToken),
        ...(typeof outputCostPerToken === "number"
          ? { outputPerMTok: perMillion(outputCostPerToken) }
          : {}),
        ...(typeof cacheReadInputTokenCost === "number"
          ? { cacheReadPerMTok: perMillion(cacheReadInputTokenCost) }
          : {}),
      };
    }

    if (missing.length > 0) {
      throw new Error(`LiteLLM data missing for: ${missing.join(", ")}`);
    }

    const outPath = options.out ?? join(cwd, ".tokensift", "pricing-overrides.json");
    const existing = existsSync(outPath)
      ? (JSON.parse(readFileSync(outPath, "utf8")) as Record<string, PricingOverride>)
      : {};
    const merged = { ...existing, ...overrides };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);

    return {
      exitCode: 0,
      output: `refreshed pricing for ${Object.keys(overrides).length} models, wrote ${outPath}`,
    };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}
