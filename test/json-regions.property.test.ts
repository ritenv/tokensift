import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findJsonRegions } from "../src/services/json-regions.js";

const words = ["lorem", "ipsum", "ticket", "field", "value", "note", "the", "model", "summary"];
const prose = fc.array(fc.constantFrom(...words), { maxLength: 6 }).map((w) => w.join(" "));

// -0 doesn't round-trip through JSON.stringify/JSON.parse at all (JSON.stringify(-0) is the
// string "0", parsing it back gives +0) -- that information loss happens entirely inside
// JS's own native JSON functions, before findJsonRegions ever sees the text, so testing
// round-trip fidelity against a value containing -0 isn't a real invariant to hold it to.
function containsNegativeZero(v: unknown): boolean {
  if (Object.is(v, -0)) return true;
  if (Array.isArray(v)) return v.some(containsNegativeZero);
  if (v !== null && typeof v === "object") return Object.values(v).some(containsNegativeZero);
  return false;
}

const nonTrivialJsonValue = fc
  .jsonValue({ maxDepth: 3 })
  .filter((v) => Array.isArray(v) || (typeof v === "object" && v !== null))
  .filter((v) => (Array.isArray(v) ? v.length > 0 : Object.keys(v as object).length > 0))
  .filter((v) => !containsNegativeZero(v));

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

const keyName = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 3, maxLength: 8 })
  .map((chars) => chars.join(""));

const leafPrimitive = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null));

// guaranteed to contain a space, so there's always somewhere to inject a raw control char
const spacedString = fc
  .string({ minLength: 3, maxLength: 30 })
  .filter((s) => !s.includes('"') && !s.includes("\\") && s.includes(" "));

const controlChar = fc.constantFrom("\n", "\r", "\t");

function injectRawControlChar(s: string, ch: string): string {
  const idx = s.indexOf(" ");
  return s.slice(0, idx) + ch + s.slice(idx + 1);
}

// written directly rather than via JSON.stringify, which would escape the control char
// to "\n"/"\r"/"\t" instead of leaving it as the literal invalid byte we want to test
function buildNearMissObjectText(
  entries: [string, unknown][],
  targetKey: string,
  injectedValue: string,
): string {
  const parts = entries.map(([k, v]) => {
    if (k === targetKey) return `${JSON.stringify(k)}:"${injectedValue}"`;
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{${parts.join(",")}}`;
}

describe("findJsonRegions near-miss JSON (property-based)", () => {
  it("tolerates a literal raw control character inside a JSON string value", () => {
    fc.assert(
      fc.property(
        keyName,
        spacedString,
        controlChar,
        fc.dictionary(keyName, leafPrimitive, { maxKeys: 3 }),
        (targetKey, str, ch, siblings) => {
          fc.pre(!(targetKey in siblings));
          const injectedString = injectRawControlChar(str, ch);
          const entries: [string, unknown][] = [...Object.entries(siblings), [targetKey, str]];
          const nearMissText = buildNearMissObjectText(entries, targetKey, injectedString);
          const expectedValue = { ...siblings, [targetKey]: injectedString };

          // sanity check: confirm this really is invalid per strict JSON, so the test is
          // actually exercising the tolerant retry path, not accidentally still-valid JSON
          expect(() => JSON.parse(nearMissText)).toThrow();

          const text = `prefix text ${nearMissText} suffix text`;
          const regions = findJsonRegions(text);
          expect(regions).toHaveLength(1);
          expect(regions[0]?.value).toEqual(expectedValue);
          expect(regions[0]?.text).toBe(nearMissText);
          expect(text.slice(...regions[0]!.range)).toBe(regions[0]!.text);
        },
      ),
    );
  });
});
