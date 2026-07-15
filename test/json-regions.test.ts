import { describe, expect, it } from "vitest";
import { findJsonRegions } from "../src/services/json-regions.js";

describe("findJsonRegions", () => {
  it("finds an object embedded in prose", () => {
    const text = 'Here is the payload: {"id": 1, "name": "acme"} — use it as-is.';
    const regions = findJsonRegions(text);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.value).toEqual({ id: 1, name: "acme" });
  });

  it("reports the array as one region, not each row separately", () => {
    const text = '[{"a":1},{"a":2},{"a":3}]';
    const regions = findJsonRegions(text);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.value).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("ignores braces inside string values", () => {
    const text = '{"note": "wrap it in { } if you want"}';
    const regions = findJsonRegions(text);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.text).toBe(text);
  });

  it("skips malformed JSON without throwing", () => {
    const text = "{not: valid, json}";
    expect(() => findJsonRegions(text)).not.toThrow();
    expect(findJsonRegions(text)).toEqual([]);
  });

  it("recovers a valid region after a malformed one on the same line", () => {
    const text = '{broken} then {"ok": true}';
    const regions = findJsonRegions(text);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.value).toEqual({ ok: true });
  });

  it("returns character ranges that slice back to the original text", () => {
    const text = 'prefix {"x": 1} suffix';
    const [region] = findJsonRegions(text);
    const [from, to] = region!.range;
    expect(text.slice(from, to)).toBe('{"x": 1}');
  });
});
