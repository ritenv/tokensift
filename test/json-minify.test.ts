import { describe, expect, it } from "vitest";
import { minifyJsonText } from "../src/services/json-minify.js";

describe("minifyJsonText", () => {
  it("strips whitespace between tokens", () => {
    expect(minifyJsonText('{\n  "a": 1,\n  "b": 2\n}')).toBe('{"a":1,"b":2}');
  });

  it("preserves whitespace inside string literals", () => {
    expect(minifyJsonText('{\n  "text": "hello   world"\n}')).toBe('{"text":"hello   world"}');
  });

  it("preserves duplicate keys verbatim, unlike JSON.parse/stringify", () => {
    const input = '{\n  "status": "active",\n  "status": "inactive"\n}';
    expect(minifyJsonText(input)).toBe('{"status":"active","status":"inactive"}');
  });

  it("preserves integers beyond Number.MAX_SAFE_INTEGER exactly", () => {
    const input = '{\n  "id": 12345678901234567890\n}';
    expect(minifyJsonText(input)).toBe('{"id":12345678901234567890}');
  });

  it("preserves explicit decimal formatting like 1.0", () => {
    expect(minifyJsonText('{\n  "price": 1.0\n}')).toBe('{"price":1.0}');
  });

  it("preserves escaped quotes and backslashes inside strings", () => {
    const input = '{\n  "text": "she said \\"hi\\" then left\\\\"\n}';
    expect(minifyJsonText(input)).toBe('{"text":"she said \\"hi\\" then left\\\\"}');
  });

  it("preserves a literal newline escape sequence inside a string", () => {
    const input = '{\n  "text": "line one\\nline two"\n}';
    expect(minifyJsonText(input)).toBe('{"text":"line one\\nline two"}');
  });

  it("is a no-op on already-minified JSON", () => {
    const input = '{"a":1,"b":[1,2,3]}';
    expect(minifyJsonText(input)).toBe(input);
  });

  it("round-trips to the same parsed value as JSON.stringify would for well-behaved input", () => {
    const input = '{\n  "a": 1,\n  "nested": { "b": [1, 2, 3] }\n}';
    expect(JSON.parse(minifyJsonText(input))).toEqual(JSON.parse(input));
  });
});
