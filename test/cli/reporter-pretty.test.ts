import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { formatPretty } from "../../src/cli/reporter-pretty.js";
import { uuidBloat } from "../../src/rules/uuid-bloat.js";

describe("formatPretty", () => {
  it("lists the filename and each finding's rule id and message", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });

    const output = formatPretty([{ file: "ticket.txt", report }]);
    expect(output).toContain("ticket.txt");
    expect(output).toContain("uuid-bloat");
    expect(output).toContain("1 finding(s)");
  });

  it("says 'no findings' for a clean file", () => {
    const report = analyze("summarize the ticket", { model: "gpt-4o", rules: [uuidBloat] });
    const output = formatPretty([{ file: "clean.txt", report }]);
    expect(output).toContain("no findings");
  });

  it("includes a top opportunities line when there's real token savings", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    const output = formatPretty([{ file: "ticket.txt", report }]);
    expect(output).toContain("top opportunities:");
    expect(output).toMatch(/total addressable waste ~= \d+ tokens/);
  });

  it("adds ANSI color codes only when color is requested", () => {
    const report = analyze("id: 550e8400-e29b-41d4-a716-446655440000", {
      model: "gpt-4o",
      rules: [uuidBloat],
    });
    const plain = formatPretty([{ file: "ticket.txt", report }]);
    const colored = formatPretty([{ file: "ticket.txt", report }], { color: true });
    expect(plain).not.toContain("\x1b[");
    expect(colored).toContain("\x1b[");
  });
});
