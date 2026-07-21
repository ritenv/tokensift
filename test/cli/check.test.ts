import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";

let scratchDir: string | undefined;
afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
});

describe("check", () => {
  it("passes when no budget or baseline is recorded and no error-severity findings exist", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-check-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "a short static prompt");

    const result = await run(["check", file, "--model", "gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(0);
  });

  it("fails once a file exceeds a budget recorded by budget init", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-check-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "a short static prompt");
    await run(["budget", "init", file, "--model", "gpt-4o"], scratchDir);

    writeFileSync(
      file,
      "a short static prompt that has grown a great deal longer than it used to be, with plenty of extra words piled on",
    );
    const result = await run(["check", file, "--model", "gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("budget-exceeded");
  });

  it("fails on an unrelated error-severity rule even with no budget or baseline", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-check-"));
    const file = join(scratchDir, "prompt.md");
    const base64 =
      "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=";
    writeFileSync(file, `attachment:\n${base64}\nplease review`);

    const result = await run(["check", file, "--model", "gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("base64-blob");
  });

  it("--format json produces a single valid JSON document", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-check-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "a short static prompt");

    const result = await run(["check", file, "--model", "gpt-4o", "--format", "json"], scratchDir);
    expect(() => JSON.parse(result.output)).not.toThrow();
  });

  it("exits 3 when no inputs are given", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-check-"));
    const result = await run(["check", "--model", "gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("no inputs given");
  });
});
