import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findUniformObjectArrays } from "../src/services/data-rows.js";
import { findJsonRegions } from "../src/services/json-regions.js";

const primitive = fc.oneof(
  fc.string({ maxLength: 8 }).filter((s) => !s.includes('"') && !s.includes("\\")),
  fc.integer(),
  fc.boolean(),
);

const keyName = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 3, maxLength: 8 })
  .map((chars) => chars.join(""));

// rows sharing the same set of keys, mapped to arbitrary primitives per row
const uniformRows = fc
  .uniqueArray(keyName, { minLength: 2, maxLength: 4 })
  .chain((keys) =>
    fc
      .array(fc.tuple(...keys.map(() => primitive)), { minLength: 3, maxLength: 8 })
      .map((rows) => rows.map((values) => Object.fromEntries(keys.map((k, i) => [k, values[i]])))),
  );

describe("findUniformObjectArrays (property-based)", () => {
  it("finds a bare top-level uniform array, with rows matching exactly", () => {
    fc.assert(
      fc.property(uniformRows, (rows) => {
        const text = JSON.stringify(rows);
        const result = findUniformObjectArrays(findJsonRegions(text));
        expect(result).toHaveLength(1);
        expect(result[0]?.rows).toEqual(rows);
        expect(result[0]?.keys).toEqual(Object.keys(rows[0]!).sort());
      }),
    );
  });

  it("finds a uniform array wrapped one level inside a named key, with an accurate source span", () => {
    fc.assert(
      fc.property(keyName, uniformRows, (wrapperKey, rows) => {
        const text = JSON.stringify({ [wrapperKey]: rows });
        const result = findUniformObjectArrays(findJsonRegions(text));
        expect(result).toHaveLength(1);
        expect(result[0]?.rows).toEqual(rows);
        const [start, end] = result[0]!.region.range;
        expect(text.slice(start, end)).toBe(JSON.stringify(rows));
      }),
    );
  });

  it("finds each uniform array independently when several are wrapped under different keys", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(keyName, { minLength: 2, maxLength: 3 }),
        fc.array(uniformRows, { minLength: 2, maxLength: 3 }),
        (wrapperKeys, rowSets) => {
          fc.pre(wrapperKeys.length === rowSets.length);
          const obj = Object.fromEntries(wrapperKeys.map((k, i) => [k, rowSets[i]]));
          const text = JSON.stringify(obj);
          const result = findUniformObjectArrays(findJsonRegions(text));
          expect(result).toHaveLength(rowSets.length);
          const foundRowSets = result.map((r) => r.rows);
          for (const rows of rowSets) {
            expect(foundRowSets).toContainEqual(rows);
          }
        },
      ),
    );
  });

  it("never flags an array shorter than 3 rows", () => {
    fc.assert(
      fc.property(uniformRows, (rows) => {
        const short = rows.slice(0, 2);
        const text = JSON.stringify(short);
        expect(findUniformObjectArrays(findJsonRegions(text))).toEqual([]);
      }),
    );
  });

  it("never flags rows with different key sets, bare or wrapped", () => {
    fc.assert(
      fc.property(
        uniformRows,
        keyName,
        primitive,
        keyName,
        (rows, wrapperKey, extraValue, extraKey) => {
          fc.pre(!Object.keys(rows[0]!).includes(extraKey));
          const mixed = [
            ...rows.slice(0, -1),
            { ...rows[rows.length - 1]!, [extraKey]: extraValue },
          ];

          expect(findUniformObjectArrays(findJsonRegions(JSON.stringify(mixed)))).toEqual([]);
          expect(
            findUniformObjectArrays(findJsonRegions(JSON.stringify({ [wrapperKey]: mixed }))),
          ).toEqual([]);
        },
      ),
    );
  });
});
