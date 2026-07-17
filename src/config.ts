import { analyze } from "./analyze.js";
import type { Rule } from "./rule.js";
import { builtinRules } from "./rules/index.js";
import type { AnalysisInput, Severity } from "./types.js";

export interface VolumeConfig {
  requestsPerDay?: number;
  requestsPerMonth?: number;
}

export interface Config {
  model: string;
  volume?: VolumeConfig;
  rules?: Record<string, Severity | "off">;
  /** whether rules that can autofix should attach a Finding.fix; defaults to true */
  autofix?: boolean;
  /** declared total token budget, used by the budget-exceeded rule */
  budget?: number;
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
  const rules = selectRules(builtinRules, config.rules);
  return {
    analyze: (input: AnalysisInput) =>
      analyze(input, {
        model: config.model,
        rules,
        autofix: config.autofix,
        budget: config.budget,
      }),
  };
}
