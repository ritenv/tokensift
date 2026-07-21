import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { analyze } from "./analyze.js";
import type { Rule } from "./rule.js";
import { TOLERANCE_PCT } from "./rules/baseline-regression.js";
import { builtinRules } from "./rules/index.js";
import type { AnalysisInput } from "./types.js";

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

interface MatcherContext {
  testPath?: string;
  currentTestName?: string;
}

export function toBeUnderTokens(
  received: AnalysisInput,
  limit: number,
  options: { model: string },
): MatcherResult {
  const { summary } = analyze(received, { model: options.model, rules: [] });
  const pass = summary.totalTokens <= limit;
  return {
    pass,
    message: () =>
      pass
        ? `expected input not to be under ${limit} tokens, but it used ${summary.totalTokens}`
        : `expected input to be under ${limit} tokens, but it used ${summary.totalTokens}`,
  };
}

export function toHaveNoTokensiftErrors(
  received: AnalysisInput,
  options: { model: string; rules?: Rule[] },
): MatcherResult {
  const report = analyze(received, { model: options.model, rules: options.rules ?? builtinRules });
  const errors = report.findings.filter((f) => f.severity === "error");
  const pass = errors.length === 0;
  return {
    pass,
    message: () =>
      pass
        ? "expected input to have tokensift errors, but it had none"
        : `expected no tokensift errors, got ${errors.length}: ${errors.map((f) => f.ruleId).join(", ")}`,
  };
}

type BaselineStore = Record<string, number>;

function loadStore(path: string): BaselineStore {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as BaselineStore;
}

function writeStore(path: string, store: BaselineStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

export function toMatchTokenBaseline(
  this: MatcherContext,
  received: AnalysisInput,
  options: { model: string; baselineFile?: string; updateBaseline?: boolean },
): MatcherResult {
  if (!this?.testPath || !this?.currentTestName) {
    throw new Error(
      "toMatchTokenBaseline needs test context (testPath, currentTestName); call it through expect.extend, not directly",
    );
  }

  const baselinePath =
    options.baselineFile ?? join(process.cwd(), ".tokensift", "matcher-baselines.json");
  const store = loadStore(baselinePath);
  const key = `${relative(process.cwd(), this.testPath)} > ${this.currentTestName}`;

  const { summary } = analyze(received, { model: options.model, rules: [] });
  const current = summary.totalTokens;
  const recorded = store[key];

  if (recorded === undefined) {
    store[key] = current;
    writeStore(baselinePath, store);
    return {
      pass: true,
      message: () => `recorded a new token baseline of ${current} for '${key}'`,
    };
  }

  if (options.updateBaseline) {
    store[key] = current;
    writeStore(baselinePath, store);
    return { pass: true, message: () => `updated the token baseline for '${key}' to ${current}` };
  }

  const threshold = Math.ceil(recorded * (1 + TOLERANCE_PCT / 100));
  const pass = current <= threshold;
  const growthPct = (((current - recorded) / recorded) * 100).toFixed(1);

  return {
    pass,
    message: () =>
      pass
        ? `expected input to grow past its recorded baseline of ${recorded} tokens, but it used ${current}`
        : `input uses ${current} tokens, up ${growthPct}% from a baseline of ${recorded} (tolerance is ${TOLERANCE_PCT}%); pass { updateBaseline: true } once this growth is intentional`,
  };
}

const matchers = { toBeUnderTokens, toHaveNoTokensiftErrors, toMatchTokenBaseline };

const globalExpect = (globalThis as { expect?: { extend?: (m: object) => void } }).expect;
if (globalExpect?.extend) {
  globalExpect.extend(matchers);
}
