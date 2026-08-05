import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../src/cli/run.js";

let scratchDir: string | undefined;
afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
});

describe("init", () => {
  it("writes tokensift.config.json and reference snippets", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-init-"));

    const result = await run(["init"], scratchDir);
    expect(result.exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(scratchDir, "tokensift.config.json"), "utf8"));
    expect(config.model).toBe("gpt-4o");
    expect(existsSync(join(scratchDir, ".tokensift", "github-action-snippet.yml"))).toBe(true);
    expect(existsSync(join(scratchDir, ".tokensift", "pre-commit-snippet.sh"))).toBe(true);
    expect(existsSync(join(scratchDir, ".tokensift", "matcher-setup-snippet.ts"))).toBe(true);
  });

  it("--model changes the config and the CI/pre-commit snippet contents", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-init-"));

    const result = await run(["init", "--model", "claude-sonnet-4-5"], scratchDir);
    expect(result.exitCode).toBe(0);

    const config = JSON.parse(readFileSync(join(scratchDir, "tokensift.config.json"), "utf8"));
    expect(config.model).toBe("claude-sonnet-4-5");
    const action = readFileSync(
      join(scratchDir, ".tokensift", "github-action-snippet.yml"),
      "utf8",
    );
    expect(action).toContain("claude-sonnet-4-5");
  });

  it("skips existing files without --force, and reports them as skipped", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-init-"));

    await run(["init", "--model", "gpt-4o"], scratchDir);
    const second = await run(["init", "--model", "claude-sonnet-4-5"], scratchDir);

    expect(second.exitCode).toBe(0);
    expect(second.output).toContain("skipped");
    const config = JSON.parse(readFileSync(join(scratchDir, "tokensift.config.json"), "utf8"));
    expect(config.model).toBe("gpt-4o");
  });

  it("--force overwrites existing files", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-init-"));

    await run(["init", "--model", "gpt-4o"], scratchDir);
    const second = await run(["init", "--model", "claude-sonnet-4-5", "--force"], scratchDir);

    expect(second.exitCode).toBe(0);
    const config = JSON.parse(readFileSync(join(scratchDir, "tokensift.config.json"), "utf8"));
    expect(config.model).toBe("claude-sonnet-4-5");
  });

  it("exits 3 on an unknown flag", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-init-"));

    const result = await run(["init", "--nope"], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("unknown flag");
  });
});
