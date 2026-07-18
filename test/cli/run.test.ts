import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";

const cwd = fileURLToPath(new URL("../fixtures/cli", import.meta.url));
const configsDir = fileURLToPath(new URL("../fixtures/cli/configs", import.meta.url));

let scratchDir: string | undefined;
afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
});

describe("run", () => {
  it("exits 0 on a clean file with no findings", async () => {
    const result = await run(["prompts/top.md", "--model", "gpt-4o"], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("no findings");
  });

  it("exits 2 when any finding is error severity", async () => {
    const result = await run(["prompts/big-base64.md", "--model", "gpt-4o"], cwd);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("base64-blob");
  });

  it("stays at exit 0 for warnings when --max-warnings isn't set", async () => {
    const result = await run(["prompts/two-uuids.md", "--model", "gpt-4o"], cwd);
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 when --max-warnings is exceeded", async () => {
    const result = await run(
      ["prompts/two-uuids.md", "--model", "gpt-4o", "--max-warnings", "1"],
      cwd,
    );
    expect(result.exitCode).toBe(1);
  });

  it("--format json produces a single valid JSON document", async () => {
    const result = await run(["prompts/top.md", "--model", "gpt-4o", "--format", "json"], cwd);
    expect(() => JSON.parse(result.output)).not.toThrow();
  });

  it("--fix --write rewrites a real file on disk", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-cli-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "the customer said “it’s broken”");

    const result = await run([file, "--model", "gpt-4o", "--fix", "--write"], scratchDir);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(file, "utf8")).toBe('the customer said "it\'s broken"');
  });

  it("fails the whole run upfront when --write hits a JSON input, before writing anything", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-cli-"));
    const mdFile = join(scratchDir, "prompt.md");
    const jsonFile = join(scratchDir, "data.json");
    writeFileSync(mdFile, "the customer said “hello”");
    writeFileSync(jsonFile, '{"a":1}');

    const result = await run([mdFile, jsonFile, "--model", "gpt-4o", "--write"], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("--write doesn't support JSON");
    expect(readFileSync(mdFile, "utf8")).toBe("the customer said “hello”");
  });

  it("auto-discovers tokensift.config.json and doesn't require --model on the command line", async () => {
    const result = await run(["../prompts/two-uuids.md"], configsDir);
    expect(result.output).not.toContain("--model is required");
  });

  it("uses the config file's rule severity override (uuid-bloat=error)", async () => {
    const result = await run(["../prompts/two-uuids.md", "--model", "gpt-4o"], configsDir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("error");
  });

  it("a CLI flag overrides the config file's value", async () => {
    const result = await run(
      ["../prompts/two-uuids.md", "--model", "gpt-4o", "--rules", "uuid-bloat=warn"],
      configsDir,
    );
    expect(result.exitCode).toBe(0);
  });

  it("exits 3 with a clear message when no files match", async () => {
    const result = await run(["prompts/nothing-here-*.md", "--model", "gpt-4o"], cwd);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("no files matched");
  });
});
