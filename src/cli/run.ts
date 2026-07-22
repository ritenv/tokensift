import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { stdin } from "node:process";
import { createLinter, defineConfig } from "../config.js";
import { parseArgs } from "./args.js";
import { loadBaseline, resolveBaselinePath, writeBaseline } from "./baseline-store.js";
import { runBudgetInit } from "./budget-init.js";
import { runCalibrateInit, runCalibrateRun } from "./calibrate.js";
import { resolveAnthropicOverride } from "./calibration-override.js";
import { runCheck } from "./check.js";
import { loadConfig } from "./load-config.js";
import { formatJson } from "./reporter-json.js";
import { formatPretty } from "./reporter-pretty.js";
import { resolveInputs } from "./resolve-inputs.js";
import type { RunResult } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function runAnalyze(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parseArgs(argv);
    const config = loadConfig(cwd, options.config);

    const model = options.model ?? config?.model;
    if (!model) {
      throw new Error("--model is required (pass --model or set it in tokensift.config.json)");
    }
    const rules = options.rules ?? config?.rules;
    const autofix = options.fix || options.write ? true : (config?.autofix ?? true);
    const budget = config?.budget;
    const baselinePath = resolveBaselinePath(cwd, options.baselineFile);
    const baselineStore = loadBaseline(baselinePath);

    const resolved = options.stdin
      ? [{ file: "<stdin>", input: await readStdin(), writable: false }]
      : resolveInputs(options.inputs, cwd);

    if (options.write) {
      const unwritable = resolved.filter((r) => !r.writable).map((r) => r.file);
      if (unwritable.length > 0) {
        throw new Error(
          `--write doesn't support JSON/messages input yet: ${unwritable.join(", ")}`,
        );
      }
    }

    const linter = createLinter(defineConfig({ model, rules, autofix, budget }));
    const encoder = resolveAnthropicOverride(model, cwd, options.calibrationFile);
    const results = resolved.map(({ file, input }) => {
      const baseline = baselineStore[relative(cwd, file)];
      return { file, report: linter.analyze(input, { baseline, encoder }) };
    });

    if (options.write) {
      for (const { file, report } of results) writeFileSync(file, report.applyFixes());
    }

    if (options.updateBaseline) {
      const updated = { ...baselineStore };
      for (const { file, report } of results) {
        if (file === "<stdin>") continue;
        updated[relative(cwd, file)] = report.summary.totalTokens;
      }
      writeBaseline(baselinePath, updated);
    }

    const output =
      options.format === "json"
        ? formatJson(results)
        : formatPretty(results, { color: process.stdout.isTTY === true });

    const findings = results.flatMap((r) => r.report.findings);
    const hasErrors = findings.some((f) => f.severity === "error");
    const warnCount = findings.filter((f) => f.severity === "warn").length;

    let exitCode = 0;
    if (hasErrors) exitCode = 2;
    else if (options.maxWarnings !== undefined && warnCount > options.maxWarnings) exitCode = 1;

    return { exitCode, output };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}

export async function run(argv: string[], cwd: string): Promise<RunResult> {
  if (argv[0] === "check") return runCheck(argv.slice(1), cwd);
  if (argv[0] === "budget" && argv[1] === "init") return runBudgetInit(argv.slice(2), cwd);
  if (argv[0] === "calibrate" && argv[1] === "anthropic" && argv[2] === "init") {
    return runCalibrateInit(argv.slice(3), cwd);
  }
  if (argv[0] === "calibrate" && argv[1] === "anthropic" && argv[2] === "run") {
    return runCalibrateRun(argv.slice(3), cwd);
  }
  return runAnalyze(argv, cwd);
}
