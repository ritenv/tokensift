import { describe, expect, it } from "vitest";
import * as toklint from "../src/index.js";

describe("public entry point", () => {
  it("exposes the documented top-level API", () => {
    expect(typeof toklint.analyze).toBe("function");
    expect(typeof toklint.tokenize).toBe("function");
    expect(typeof toklint.createLinter).toBe("function");
    expect(typeof toklint.defineConfig).toBe("function");
    expect(typeof toklint.t).toBe("function");
    expect(typeof toklint.dyn).toBe("function");
  });

  it("diff and budget are explicit not-yet-implemented stubs, not silently missing", () => {
    expect(() => toklint.diff()).toThrow(/not implemented/);
    expect(() => toklint.budget()).toThrow(/not implemented/);
  });
});
