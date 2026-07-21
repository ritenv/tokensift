import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadBaseline, resolveBaselinePath, writeBaseline } from "../../src/cli/baseline-store.js";

let scratchDir: string | undefined;

afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
});

describe("resolveBaselinePath", () => {
  it("defaults to .tokensift/baseline.json under cwd", () => {
    expect(resolveBaselinePath("/repo")).toBe(join("/repo", ".tokensift/baseline.json"));
  });

  it("uses the explicit path when given", () => {
    expect(resolveBaselinePath("/repo", "/elsewhere/baseline.json")).toBe(
      "/elsewhere/baseline.json",
    );
  });
});

describe("loadBaseline / writeBaseline", () => {
  it("returns an empty store when the file doesn't exist", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-baseline-"));
    expect(loadBaseline(join(scratchDir, "baseline.json"))).toEqual({});
  });

  it("round-trips a store to disk, creating parent directories", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-baseline-"));
    const path = join(scratchDir, ".tokensift", "baseline.json");
    writeBaseline(path, { "prompts/a.md": 42 });
    expect(loadBaseline(path)).toEqual({ "prompts/a.md": 42 });
    expect(readFileSync(path, "utf8")).toContain("prompts/a.md");
  });

  it("throws a clear error on invalid JSON", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-baseline-"));
    const path = join(scratchDir, "baseline.json");
    writeFileSync(path, "not json");
    expect(() => loadBaseline(path)).toThrow(/invalid JSON/);
  });
});
