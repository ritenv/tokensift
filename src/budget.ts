import { analyze } from "./analyze.js";
import type { Encoder } from "./encoder.js";
import type { AnalysisInput } from "./types.js";

export interface BudgetOptions {
  model: string;
  /** bypasses resolveEncoder(model) with a specific Encoder instance, e.g. a locally-calibrated one */
  encoder?: Encoder;
}

// Measures each named input's current token count, e.g. to seed a budget store or feed into
// budget-exceeded later. Pure, no file-system access -- same split budget-exceeded/
// baseline-regression already use (a rule only ever sees a plain number, never a file path).
// `rules: []` since only tokenize() is needed here, no reason to also run every rule's check().
export function budget(
  inputs: Record<string, AnalysisInput>,
  options: BudgetOptions,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, input] of Object.entries(inputs)) {
    const report = analyze(input, { model: options.model, encoder: options.encoder, rules: [] });
    result[key] = report.summary.totalTokens;
  }
  return result;
}
