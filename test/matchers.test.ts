import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { toBeUnderTokens, toHaveNoTokensiftErrors, toMatchTokenBaseline } from "../src/matchers.js";

describe("toBeUnderTokens", () => {
  it("passes when the input is under the limit", () => {
    const result = toBeUnderTokens("a short prompt", 100, { model: "gpt-4o" });
    expect(result.pass).toBe(true);
  });

  it("fails when the input is over the limit", () => {
    const result = toBeUnderTokens("a short prompt", 1, { model: "gpt-4o" });
    expect(result.pass).toBe(false);
    expect(result.message()).toContain("to be under 1 tokens");
  });
});

describe("toHaveNoTokensiftErrors", () => {
  it("passes on a clean prompt", () => {
    const result = toHaveNoTokensiftErrors("a short prompt", { model: "gpt-4o" });
    expect(result.pass).toBe(true);
  });

  it("fails when an error-severity rule fires", () => {
    const base64 =
      "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=";
    const result = toHaveNoTokensiftErrors(`attachment:\n${base64}\nplease review`, {
      model: "gpt-4o",
    });
    expect(result.pass).toBe(false);
    expect(result.message()).toContain("base64-blob");
  });
});

describe("toMatchTokenBaseline", () => {
  let scratchDir: string;
  const ctx = { testPath: "test/matchers.test.ts", currentTestName: "some test" };

  function baselineFile() {
    return join(scratchDir, "matcher-baselines.json");
  }

  afterEach(() => {
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  });

  it("records a new baseline and passes on the first run", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-matchers-"));
    const result = toMatchTokenBaseline.call(ctx, "a short prompt", {
      model: "gpt-4o",
      baselineFile: baselineFile(),
    });
    expect(result.pass).toBe(true);
    expect(result.message()).toContain("recorded a new token baseline");
  });

  it("passes on a second run within tolerance", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-matchers-"));
    const options = { model: "gpt-4o", baselineFile: baselineFile() };
    toMatchTokenBaseline.call(ctx, "a short prompt", options);
    const result = toMatchTokenBaseline.call(ctx, "a short prompt", options);
    expect(result.pass).toBe(true);
  });

  it("fails once the input grows past the recorded baseline's tolerance", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-matchers-"));
    const options = { model: "gpt-4o", baselineFile: baselineFile() };
    toMatchTokenBaseline.call(ctx, "a short prompt", options);
    const result = toMatchTokenBaseline.call(
      ctx,
      "a short prompt that has grown a great deal longer than it used to be, with plenty of extra words piled on",
      options,
    );
    expect(result.pass).toBe(false);
    expect(result.message()).toContain("tolerance is 10%");
  });

  it("updateBaseline accepts intentional growth", () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-matchers-"));
    const options = { model: "gpt-4o", baselineFile: baselineFile() };
    toMatchTokenBaseline.call(ctx, "a short prompt", options);
    const result = toMatchTokenBaseline.call(
      ctx,
      "a short prompt that has grown a great deal longer than it used to be, with plenty of extra words piled on",
      { ...options, updateBaseline: true },
    );
    expect(result.pass).toBe(true);
    expect(result.message()).toContain("updated the token baseline");
  });

  it("throws when called without test context", () => {
    expect(() => toMatchTokenBaseline.call({}, "a short prompt", { model: "gpt-4o" })).toThrow(
      /needs test context/,
    );
  });
});
