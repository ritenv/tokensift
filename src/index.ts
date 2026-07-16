export { analyze, tokenize } from "./analyze.js";
export type { AnalyzeOptions, Report, TokenizeOptions } from "./analyze.js";
export { createLinter, defineConfig } from "./config.js";
export type { Config, VolumeConfig } from "./config.js";
export { resolveEncoder } from "./encoder.js";
export type { AnalysisContext, Rule } from "./rule.js";
export { builtinRules, unicodePunct, uuidBloat } from "./rules/index.js";
export { dyn, t } from "./tag.js";
export type * from "./types.js";

export function diff(): never {
  throw new Error("diff() is not implemented yet");
}

export function budget(): never {
  throw new Error("budget() is not implemented yet");
}
