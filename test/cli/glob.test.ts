import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveGlob } from "../../src/cli/glob.js";

const cwd = fileURLToPath(new URL("../fixtures/cli", import.meta.url));

describe("resolveGlob", () => {
  it("matches a zero-depth file with **, not just nested ones", () => {
    const matches = resolveGlob("prompts/**/*.md", cwd);
    expect(matches).toContain(`${cwd}/prompts/top.md`);
  });

  it("also matches nested files with **", () => {
    const matches = resolveGlob("prompts/**/*.md", cwd);
    expect(matches).toContain(`${cwd}/prompts/nested/deep.md`);
  });

  it("a plain * only matches the top level, not nested files", () => {
    const matches = resolveGlob("prompts/*.md", cwd);
    expect(matches).toEqual([`${cwd}/prompts/top.md`]);
  });

  it("resolves a literal path directly", () => {
    const matches = resolveGlob("prompts/top.md", cwd);
    expect(matches).toEqual([`${cwd}/prompts/top.md`]);
  });

  it("returns nothing for a literal path that doesn't exist", () => {
    expect(resolveGlob("prompts/missing.md", cwd)).toEqual([]);
  });

  it("filters by extension, ignoring files that don't match", () => {
    const matches = resolveGlob("prompts/**/*.md", cwd);
    expect(matches.some((m) => m.endsWith("notes.txt"))).toBe(false);
  });
});
