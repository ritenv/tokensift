import { builtinRules } from "../rules/index.js";
import type { Severity } from "../types.js";

export interface CliOptions {
  inputs: string[];
  /** may come from a config file instead, so not required at parse time */
  model?: string;
  format: "pretty" | "json";
  rules?: Record<string, Severity | "off">;
  maxWarnings?: number;
  fix: boolean;
  write: boolean;
  stdin: boolean;
  config?: string;
}

const KNOWN_RULE_IDS = new Set(builtinRules.map((r) => r.id));
const VALID_SEVERITIES = new Set(["off", "error", "warn", "info"]);

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) throw new Error(`${flag} expects a value`);
  return value;
}

function parseRules(value: string): Record<string, Severity | "off"> {
  const rules: Record<string, Severity | "off"> = {};
  for (const pair of value.split(",")) {
    const [id, severity] = pair.split("=");
    if (!id || !severity) {
      throw new Error(`invalid --rules entry '${pair}', expected ruleId=severity`);
    }
    if (!KNOWN_RULE_IDS.has(id)) {
      throw new Error(`unknown rule '${id}' in --rules`);
    }
    if (!VALID_SEVERITIES.has(severity)) {
      throw new Error(`invalid severity '${severity}' for rule '${id}' in --rules`);
    }
    rules[id] = severity as Severity | "off";
  }
  return rules;
}

export function parseArgs(argv: string[]): CliOptions {
  const inputs: string[] = [];
  let model: string | undefined;
  let format: "pretty" | "json" = "pretty";
  let rules: Record<string, Severity | "off"> | undefined;
  let maxWarnings: number | undefined;
  let fix = false;
  let write = false;
  let stdin = false;
  let config: string | undefined;
  let sawCommand = false;

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
      case "--rules":
        rules = parseRules(requireValue(argv, ++i, "--rules"));
        continue;
      case "--max-warnings": {
        const value = requireValue(argv, ++i, "--max-warnings");
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(`--max-warnings expects a non-negative integer, got '${value}'`);
        }
        maxWarnings = n;
        continue;
      }
      case "--config":
        config = requireValue(argv, ++i, "--config");
        continue;
      case "--fix":
        fix = true;
        continue;
      case "--write":
        write = true;
        continue;
      case "--stdin":
        stdin = true;
        continue;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`unknown flag '${arg}'`);
        }
        if (!sawCommand && arg === "analyze") {
          sawCommand = true;
          continue;
        }
        sawCommand = true;
        inputs.push(arg);
    }
  }

  if (!stdin && inputs.length === 0) {
    throw new Error("no inputs given; pass file paths/globs or --stdin");
  }

  return { inputs, model, format, rules, maxWarnings, fix, write, stdin, config };
}
