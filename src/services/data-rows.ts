import type { JsonRegion } from "../types.js";

const MIN_ROWS = 3;

export interface UniformArray {
  region: JsonRegion;
  rows: Record<string, unknown>[];
  keys: string[];
}

function isPlainRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findUniformObjectArrays(regions: JsonRegion[]): UniformArray[] {
  const result: UniformArray[] = [];

  for (const region of regions) {
    if (!Array.isArray(region.value) || region.value.length < MIN_ROWS) continue;
    if (!region.value.every(isPlainRow)) continue;

    const rows = region.value as Record<string, unknown>[];
    const keys = Object.keys(rows[0]!).sort();
    const sameShape = rows.every((row) => {
      const rowKeys = Object.keys(row).sort();
      return rowKeys.length === keys.length && rowKeys.every((k, i) => k === keys[i]);
    });
    if (!sameShape) continue;

    result.push({ region, rows, keys });
  }

  return result;
}
