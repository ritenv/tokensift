import { describe, expect, it } from "vitest";
import { tokenize } from "../src/analyze.js";
import { budget } from "../src/budget.js";

describe("budget", () => {
  it("measures each named input's token count independently", async () => {
    const result = await budget(
      { short: "hi", long: "this is a considerably longer piece of text than the other one" },
      { model: "gpt-4o" },
    );
    expect(Object.keys(result).sort()).toEqual(["long", "short"]);
    expect(result.short).toBeGreaterThan(0);
    expect(result.long!).toBeGreaterThan(result.short!);
  });

  it("matches tokenize()'s count exactly for a plain string input", async () => {
    const text = "You are a support agent handling billing tickets.";
    const result = await budget({ a: text }, { model: "gpt-4o" });
    const view = await tokenize(text, { model: "gpt-4o" });
    expect(result.a).toBe(view.count);
  });

  it("returns an empty object for an empty input map", async () => {
    expect(await budget({}, { model: "gpt-4o" })).toEqual({});
  });

  it("accepts Message[] and Payload inputs, not just strings", async () => {
    const result = await budget(
      {
        messages: [{ role: "user", content: "hello there" }],
        payload: { system: "be helpful", messages: [{ role: "user", content: "hi" }] },
      },
      { model: "gpt-4o" },
    );
    expect(result.messages).toBeGreaterThan(0);
    expect(result.payload).toBeGreaterThan(0);
  });

  it("does not run rules, only tokenizes (fast path for pure measurement)", async () => {
    // a UUID would normally trigger uuid-bloat; budget() should still just report the
    // raw token count without attaching any rule-driven side effects
    const result = await budget(
      { a: "id: 550e8400-e29b-41d4-a716-446655440000" },
      { model: "gpt-4o" },
    );
    const view = await tokenize("id: 550e8400-e29b-41d4-a716-446655440000", { model: "gpt-4o" });
    expect(result.a).toBe(view.count);
  });
});
