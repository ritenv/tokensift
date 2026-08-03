import { relative } from "node:path";
import { budget } from "../budget.js";
import { requireValue } from "./args.js";
import { resolveBudgetPath, writeBudget } from "./budget-store.js";
import { loadConfig } from "./load-config.js";
import { resolveInputs } from "./resolve-inputs.js";
import type { RunResult } from "./types.js";

interface BudgetInitOptions {
  inputs: string[];
  model?: string;
  config?: string;
  budgetFile?: string;
}

function parseBudgetInitArgs(argv: string[]): BudgetInitOptions {
  const inputs: string[] = [];
  let model: string | undefined;
  let config: string | undefined;
  let budgetFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--model":
        model = requireValue(argv, ++i, "--model");
        continue;
      case "--config":
        config = requireValue(argv, ++i, "--config");
        continue;
      case "--budget-file":
        budgetFile = requireValue(argv, ++i, "--budget-file");
        continue;
      default:
        if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
        inputs.push(arg);
    }
  }

  if (inputs.length === 0) {
    throw new Error("no inputs given; pass file paths or globs to measure");
  }

  return { inputs, model, config, budgetFile };
}

export async function runBudgetInit(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parseBudgetInitArgs(argv);
    const config = loadConfig(cwd, options.config);

    const model = options.model ?? config?.model;
    if (!model) {
      throw new Error("--model is required (pass --model or set it in tokensift.config.json)");
    }

    const resolved = resolveInputs(options.inputs, cwd);
    const budgetPath = resolveBudgetPath(cwd, options.budgetFile);

    const inputsByKey = Object.fromEntries(
      resolved.map(({ file, input }) => [relative(cwd, file), input]),
    );
    const store = budget(inputsByKey, { model });
    const lines = Object.entries(store).map(([key, tokens]) => `${key}: ${tokens} tokens`);
    writeBudget(budgetPath, store);
    lines.push("", `wrote ${resolved.length} budget(s) to ${budgetPath}`);

    return { exitCode: 0, output: lines.join("\n") };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}
