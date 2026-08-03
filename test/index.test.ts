import { describe, expect, it } from "vitest";
import * as tokensift from "../src/index.js";

describe("public entry point", () => {
  it("exposes the documented top-level API", () => {
    expect(typeof tokensift.analyze).toBe("function");
    expect(typeof tokensift.tokenize).toBe("function");
    expect(typeof tokensift.createLinter).toBe("function");
    expect(typeof tokensift.defineConfig).toBe("function");
    expect(typeof tokensift.defineRule).toBe("function");
    expect(typeof tokensift.budget).toBe("function");
    expect(typeof tokensift.t).toBe("function");
    expect(typeof tokensift.dyn).toBe("function");
  });

  it("budget() is a real implementation, not a stub", () => {
    const result = tokensift.budget(
      { a: "short prompt", b: "a somewhat longer prompt with more words in it" },
      { model: "gpt-4o" },
    );
    expect(result.a!).toBeGreaterThan(0);
    expect(result.b!).toBeGreaterThan(result.a!);
  });

  it("does not export diff(), removed rather than left as a permanent stub", () => {
    expect("diff" in tokensift).toBe(false);
  });

  it("builtinRules is frozen, so a consumer can't corrupt shared state by mutating it", () => {
    expect(Object.isFrozen(tokensift.builtinRules)).toBe(true);
    expect(() => (tokensift.builtinRules as unknown[]).push({})).toThrow();
  });
});
