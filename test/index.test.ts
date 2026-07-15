import { describe, expect, it } from "vitest";
import * as tokensift from "../src/index.js";

describe("public entry point", () => {
  it("exposes the documented top-level API", () => {
    expect(typeof tokensift.analyze).toBe("function");
    expect(typeof tokensift.tokenize).toBe("function");
    expect(typeof tokensift.createLinter).toBe("function");
    expect(typeof tokensift.defineConfig).toBe("function");
    expect(typeof tokensift.t).toBe("function");
    expect(typeof tokensift.dyn).toBe("function");
  });

  it("diff and budget are explicit not-yet-implemented stubs, not silently missing", () => {
    expect(() => tokensift.diff()).toThrow(/not implemented/);
    expect(() => tokensift.budget()).toThrow(/not implemented/);
  });
});
