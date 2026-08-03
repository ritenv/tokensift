import { analyze } from "./analyze.js";
import type { Encoder } from "./encoder.js";
import type { PricingOverride, VolumeOptions } from "./pricing.js";
import type { Rule } from "./rule.js";
import { builtinRules } from "./rules/index.js";
import type { AnalysisInput, Severity } from "./types.js";

export type VolumeConfig = VolumeOptions;

export interface Config {
  model: string;
  volume?: VolumeConfig;
  rules?: Record<string, Severity | "off">;
  /** extra rules to run alongside the builtins, e.g. from a plugin package; matched by id like any other rule */
  customRules?: Rule[];
  /** whether rules that can autofix should attach a Finding.fix; defaults to true */
  autofix?: boolean;
  /** declared total token budget, used by the budget-exceeded rule */
  budget?: number;
  /** per-model price overrides, keyed by exact model id, dollars per million tokens */
  pricing?: { overrides?: Record<string, PricingOverride> };
}

export function defineConfig(config: Config): Config {
  return config;
}

function selectRules(rules: Rule[], overrides: Config["rules"]): Rule[] {
  if (!overrides) return rules;
  return rules
    .filter((rule) => overrides[rule.id] !== "off")
    .map((rule) => {
      const severity = overrides[rule.id];
      return severity && severity !== "off" ? { ...rule, defaultSeverity: severity } : rule;
    });
}

export function createLinter(config: Config) {
  const rules = selectRules([...builtinRules, ...(config.customRules ?? [])], config.rules);
  return {
    analyze: (
      input: AnalysisInput,
      overrides?: {
        path?: string;
        baseline?: number;
        budget?: number;
        encoder?: Encoder;
        pricingOverrides?: Record<string, PricingOverride>;
      },
    ) =>
      analyze(input, {
        model: config.model,
        path: overrides?.path,
        rules,
        autofix: config.autofix,
        budget: overrides?.budget ?? config.budget,
        baseline: overrides?.baseline,
        encoder: overrides?.encoder,
        volume: config.volume,
        pricingOverrides: { ...config.pricing?.overrides, ...overrides?.pricingOverrides },
      }),
  };
}
