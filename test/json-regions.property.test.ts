import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findJsonRegions } from "../src/services/json-regions.js";

const words = ["lorem", "ipsum", "ticket", "field", "value", "note", "the", "model", "summary"];
const prose = fc.array(fc.constantFrom(...words), { maxLength: 6 }).map((w) => w.join(" "));

const nonTrivialJsonValue = fc
  .jsonValue({ maxDepth: 3 })
  .filter((v) => Array.isArray(v) || (typeof v === "object" && v !== null))
  .filter((v) => (Array.isArray(v) ? v.length > 0 : Object.keys(v as object).length > 0));

const isTrivial = (v: unknown) =>
  Array.isArray(v)
    ? v.length === 0
    : typeof v === "object" && v !== null && Object.keys(v).length === 0;

describe("findJsonRegions (property-based)", () => {
  it("every returned region's range slices back to its own text", () => {
    fc.assert(
      fc.property(prose, nonTrivialJsonValue, prose, (before, value, after) => {
        const text = `${before} ${JSON.stringify(value)} ${after}`;
        for (const region of findJsonRegions(text)) {
          expect(text.slice(...region.range)).toBe(region.text);
        }
      }),
    );
  });

  it("every returned region's text parses back to its own value", () => {
    fc.assert(
      fc.property(prose, nonTrivialJsonValue, prose, (before, value, after) => {
        const text = `${before} ${JSON.stringify(value)} ${after}`;
        for (const region of findJsonRegions(text)) {
          expect(JSON.parse(region.text)).toEqual(region.value);
        }
      }),
    );
  });

  it("a single embedded non-trivial JSON value is always found, exactly once", () => {
    fc.assert(
      fc.property(prose, nonTrivialJsonValue, prose, (before, value, after) => {
        const text = `${before} ${JSON.stringify(value)} ${after}`;
        const regions = findJsonRegions(text);
        expect(regions).toHaveLength(1);
        expect(regions[0]?.value).toEqual(value);
      }),
    );
  });

  it("never returns a trivial (empty array/object) region", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(nonTrivialJsonValue, fc.constant([]), fc.constant({})), { maxLength: 5 }),
        (values) => {
          const text = values.map((v) => JSON.stringify(v)).join(" filler ");
          for (const region of findJsonRegions(text)) {
            expect(isTrivial(region.value)).toBe(false);
          }
        },
      ),
    );
  });

  it("regions are sorted by start and never overlap", () => {
    fc.assert(
      fc.property(fc.array(nonTrivialJsonValue, { maxLength: 6 }), (values) => {
        const text = values.map((v) => JSON.stringify(v)).join(" filler text between them ");
        const regions = findJsonRegions(text);
        for (let i = 1; i < regions.length; i++) {
          expect(regions[i]!.range[0]).toBeGreaterThanOrEqual(regions[i - 1]!.range[1]);
        }
      }),
    );
  });

  it("never throws on arbitrary text, including unbalanced brackets and quotes", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        expect(() => findJsonRegions(text)).not.toThrow();
      }),
    );
  });
});
