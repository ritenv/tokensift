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
import { runInit } from "./init.js";
import { loadConfig } from "./load-config.js";
import { runPricingShow, runPricingUpdate } from "./pricing-cli.js";
import { loadPricingOverrides } from "./pricing-override.js";
import { formatGithub } from "./reporter-github.js";
import { formatJson } from "./reporter-json.js";
import { formatMarkdown } from "./reporter-markdown.js";
import { formatPretty } from "./reporter-pretty.js";
import { formatSarif } from "./reporter-sarif.js";
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

    const linter = createLinter(
      defineConfig({
        model,
        rules,
        autofix,
        budget,
        volume: config?.volume,
        pricing: config?.pricing,
      }),
    );
    const encoder = resolveAnthropicOverride(model, cwd, options.calibrationFile);
    const pricingOverrides = loadPricingOverrides(cwd, options.pricingFile);
    const results = resolved.map(({ file, input }) => {
      const path = relative(cwd, file);
      const baseline = baselineStore[path];
      const report = linter.analyze(input, { path, baseline, encoder, pricingOverrides });
      // display file as the cwd-relative path (matches loc.input.path, and is
      // what a github/markdown reporter needs to annotate the right file in a
      // PR diff); "<stdin>" is a sentinel, not a real path, left untouched.
      const displayFile = file === "<stdin>" ? file : path;
      return { file: displayFile, report, text: typeof input === "string" ? input : undefined };
    });

    if (options.write) {
      for (let i = 0; i < resolved.length; i++) {
        writeFileSync(resolved[i]!.file, results[i]!.report.applyFixes());
      }
    }

    if (options.updateBaseline) {
      const updated = { ...baselineStore };
      for (const { file, report } of results) {
        if (file === "<stdin>") continue;
        updated[file] = report.summary.totalTokens;
      }
      writeBaseline(baselinePath, updated);
    }

    const output =
      options.format === "json"
        ? formatJson(results)
        : options.format === "github"
          ? formatGithub(results)
          : options.format === "markdown"
            ? formatMarkdown(results)
            : options.format === "sarif"
              ? formatSarif(results)
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

const HELP = `tokensift <files|glob...> --model <model> [options]

Commands:
  tokensift <files|glob...> --model <model>   analyze prompt files (default command)
  tokensift init --model <model>              scaffold tokensift.config.json + reference snippets
  tokensift check --model <model>             CI mode: budget/baseline gate, no per-finding output
  tokensift budget init                       scaffold a budget config
  tokensift calibrate anthropic init          scaffold an Anthropic calibration fixture file
  tokensift calibrate anthropic run           run calibration against the Anthropic API
  tokensift pricing show [model]              print bundled pricing, or list all supported models
  tokensift pricing update                    refresh bundled pricing from LiteLLM

Options:
  --model <id>            model to analyze against (required)
  --format <name>         pretty (default), json, github, markdown, sarif
  --rules <id=severity,..> override a rule's severity, or "off"
  --fix --write            apply safe autofixes and write them back to the file
  --stdin                  read a single prompt from stdin instead of files
  --max-warnings <n>       exit 1 if warn-severity findings exceed n
  --config <path>          path to tokensift.config.json (default: cwd)
  --baseline-file <path>   path to the baseline store (default: .tokensift/baseline.json)
  --update-baseline        record current token counts as the new baseline
  --calibration-file <path> path to an Anthropic calibration override file
  --pricing-file <path>    path to a pricing override file
  --version, -v            print the installed version
  --help, -h               print this message

Exit codes: 0 clean, 1 warnings past --max-warnings, 2 an error-severity finding, 3 bad input/flags/config.`;

export async function run(argv: string[], cwd: string, version = "unknown"): Promise<RunResult> {
  if (argv[0] === "--version" || argv[0] === "-v") return { exitCode: 0, output: version };
  if (argv[0] === "--help" || argv[0] === "-h" || argv.length === 0) {
    return { exitCode: 0, output: HELP };
  }
  if (argv[0] === "init") return runInit(argv.slice(1), cwd);
  if (argv[0] === "check") return runCheck(argv.slice(1), cwd);
  if (argv[0] === "budget" && argv[1] === "init") return runBudgetInit(argv.slice(2), cwd);
  if (argv[0] === "calibrate" && argv[1] === "anthropic" && argv[2] === "init") {
    return runCalibrateInit(argv.slice(3), cwd);
  }
  if (argv[0] === "calibrate" && argv[1] === "anthropic" && argv[2] === "run") {
    return runCalibrateRun(argv.slice(3), cwd);
  }
  if (argv[0] === "pricing" && argv[1] === "show") return runPricingShow(argv.slice(2), cwd);
  if (argv[0] === "pricing" && argv[1] === "update") return runPricingUpdate(argv.slice(2), cwd);
  return runAnalyze(argv, cwd);
}
