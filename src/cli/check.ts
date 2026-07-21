import { relative } from "node:path";
import { createLinter, defineConfig } from "../config.js";
import { requireValue } from "./args.js";
import { loadBaseline, resolveBaselinePath } from "./baseline-store.js";
import { loadBudget, resolveBudgetPath } from "./budget-store.js";
import { loadConfig } from "./load-config.js";
import { formatJson } from "./reporter-json.js";
import { formatPretty } from "./reporter-pretty.js";
import { resolveInputs } from "./resolve-inputs.js";
import type { RunResult } from "./types.js";

interface CheckOptions {
  inputs: string[];
  model?: string;
  format: "pretty" | "json";
  config?: string;
  budgetFile?: string;
  baselineFile?: string;
}

function parseCheckArgs(argv: string[]): CheckOptions {
  const inputs: string[] = [];
  let model: string | undefined;
  let format: "pretty" | "json" = "pretty";
  let config: string | undefined;
  let budgetFile: string | undefined;
  let baselineFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--model":
        model = requireValue(argv, ++i, "--model");
        continue;
      case "--format": {
        const value = requireValue(argv, ++i, "--format");
        if (value !== "pretty" && value !== "json") {
          throw new Error(`unsupported --format '${value}', available: pretty, json`);
        }
        format = value;
        continue;
      }
      case "--config":
        config = requireValue(argv, ++i, "--config");
        continue;
      case "--budget-file":
        budgetFile = requireValue(argv, ++i, "--budget-file");
        continue;
      case "--baseline-file":
        baselineFile = requireValue(argv, ++i, "--baseline-file");
        continue;
      default:
        if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
        inputs.push(arg);
    }
  }

  if (inputs.length === 0) {
    throw new Error("no inputs given; pass file paths or globs to check");
  }

  return { inputs, model, format, config, budgetFile, baselineFile };
}

export async function runCheck(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parseCheckArgs(argv);
    const config = loadConfig(cwd, options.config);

    const model = options.model ?? config?.model;
    if (!model) {
      throw new Error("--model is required (pass --model or set it in tokensift.config.json)");
    }

    const budgetStore = loadBudget(resolveBudgetPath(cwd, options.budgetFile));
    const baselineStore = loadBaseline(resolveBaselinePath(cwd, options.baselineFile));
    const resolved = resolveInputs(options.inputs, cwd);

    const linter = createLinter(defineConfig({ model, rules: config?.rules }));
    const results = resolved.map(({ file, input }) => {
      const key = relative(cwd, file);
      return {
        file,
        report: linter.analyze(input, { budget: budgetStore[key], baseline: baselineStore[key] }),
      };
    });

    const output =
      options.format === "json"
        ? formatJson(results)
        : formatPretty(results, { color: process.stdout.isTTY === true });

    const hasErrors = results.some((r) => r.report.findings.some((f) => f.severity === "error"));
    return { exitCode: hasErrors ? 2 : 0, output };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}
