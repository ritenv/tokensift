import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli/args.js";

describe("parseArgs", () => {
  it("parses a basic analyze invocation", () => {
    const opts = parseArgs(["prompts/*.md", "--model", "gpt-4o"]);
    expect(opts.inputs).toEqual(["prompts/*.md"]);
    expect(opts.model).toBe("gpt-4o");
    expect(opts.format).toBe("pretty");
  });

  it("drops a leading explicit 'analyze' command name", () => {
    const opts = parseArgs(["analyze", "prompts/*.md", "--model", "gpt-4o"]);
    expect(opts.inputs).toEqual(["prompts/*.md"]);
  });

  it("collects multiple positional inputs", () => {
    const opts = parseArgs(["a.md", "b.md", "--model", "gpt-4o"]);
    expect(opts.inputs).toEqual(["a.md", "b.md"]);
  });

  it("parses --rules into a severity map, validating known rule ids", () => {
    const opts = parseArgs(["a.md", "--model", "gpt-4o", "--rules", "uuid-bloat=off,filler=error"]);
    expect(opts.rules).toEqual({ "uuid-bloat": "off", filler: "error" });
  });

  it("rejects an unknown rule id in --rules", () => {
    expect(() => parseArgs(["a.md", "--model", "gpt-4o", "--rules", "typo-rule=off"])).toThrow(
      /unknown rule/,
    );
  });

  it("rejects an invalid severity in --rules", () => {
    expect(() =>
      parseArgs(["a.md", "--model", "gpt-4o", "--rules", "uuid-bloat=nonsense"]),
    ).toThrow(/invalid severity/);
  });

  it("parses --max-warnings as a non-negative integer", () => {
    const opts = parseArgs(["a.md", "--model", "gpt-4o", "--max-warnings", "5"]);
    expect(opts.maxWarnings).toBe(5);
  });

  it("rejects a negative --max-warnings", () => {
    expect(() => parseArgs(["a.md", "--model", "gpt-4o", "--max-warnings", "-1"])).toThrow(
      /non-negative integer/,
    );
  });

  it("rejects an unsupported --format", () => {
    expect(() => parseArgs(["a.md", "--model", "gpt-4o", "--format", "sarif"])).toThrow(
      /unsupported --format/,
    );
  });

  it("parses --fix, --write, and --stdin as booleans", () => {
    const opts = parseArgs(["a.md", "--model", "gpt-4o", "--fix", "--write"]);
    expect(opts.fix).toBe(true);
    expect(opts.write).toBe(true);
    expect(opts.stdin).toBe(false);
  });

  it("allows zero inputs when --stdin is set", () => {
    const opts = parseArgs(["--model", "gpt-4o", "--stdin"]);
    expect(opts.inputs).toEqual([]);
    expect(opts.stdin).toBe(true);
  });

  it("leaves model undefined when --model isn't given, a config file may supply it", () => {
    const opts = parseArgs(["a.md"]);
    expect(opts.model).toBeUndefined();
  });

  it("requires at least one input when --stdin isn't set", () => {
    expect(() => parseArgs(["--model", "gpt-4o"])).toThrow(/no inputs given/);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["a.md", "--model", "gpt-4o", "--verify", "anthropic"])).toThrow(
      /unknown flag/,
    );
  });

  it("parses --config", () => {
    const opts = parseArgs(["a.md", "--model", "gpt-4o", "--config", "./my.config.json"]);
    expect(opts.config).toBe("./my.config.json");
  });
});
