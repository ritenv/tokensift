import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";

let scratchDir: string | undefined;
afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
});

describe("budget init", () => {
  it("writes current token counts to .tokensift/budgets.json", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-budget-init-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "a short static prompt");

    const result = await run(["budget", "init", file, "--model", "gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(0);

    const budgets = JSON.parse(
      readFileSync(join(scratchDir, ".tokensift", "budgets.json"), "utf8"),
    );
    expect(budgets["prompt.md"]).toBeGreaterThan(0);
  });

  it("--budget-file writes to a custom path", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-budget-init-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "a short static prompt");
    const budgetFile = join(scratchDir, "custom-budgets.json");

    const result = await run(
      ["budget", "init", file, "--model", "gpt-4o", "--budget-file", budgetFile],
      scratchDir,
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(budgetFile, "utf8"))["prompt.md"]).toBeGreaterThan(0);
  });

  it("exits 3 when --model is missing and no config supplies one", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-budget-init-"));
    const file = join(scratchDir, "prompt.md");
    writeFileSync(file, "a short static prompt");

    const result = await run(["budget", "init", file], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("--model is required");
  });

  it("exits 3 when no inputs are given", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-budget-init-"));
    const result = await run(["budget", "init", "--model", "gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("no inputs given");
  });
});
