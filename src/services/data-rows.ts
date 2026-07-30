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

function uniformKeys(rows: Record<string, unknown>[]): string[] | null {
  if (rows.length < MIN_ROWS || !rows.every(isPlainRow)) return null;
  const keys = Object.keys(rows[0]!).sort();
  const sameShape = rows.every((row) => {
    const rowKeys = Object.keys(row).sort();
    return rowKeys.length === keys.length && rowKeys.every((k, i) => k === keys[i]);
  });
  return sameShape ? keys : null;
}

// real tool/API responses routinely wrap a row array in a named key (`{"actions": [...]}`,
// matching OpenAI's own tool-calling shape) rather than returning it bare. findJsonRegions
// only registers the whole wrapping object as one region, so the array's exact source span
// is located directly here -- matches the top-level key, bracket-matches its array value, and
// returns a region pointing at just that array, so token counts reflect the array's real text.
// Reuses the caller's already-parsed value instead of re-parsing the located substring, so a
// near-miss array (unescaped newlines inside a row's string value, tolerated by
// findJsonRegions's own parser) doesn't fail a second, stricter JSON.parse here.
function locateNestedArray(region: JsonRegion, key: string, value: unknown[]): JsonRegion | null {
  const text = region.text;
  const keyLiteral = JSON.stringify(key);
  let depth = 0;
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth === 1 && text.startsWith(keyLiteral, i)) {
        let j = i + keyLiteral.length;
        while (/\s/.test(text[j] ?? "")) j++;
        if (text[j] === ":") {
          j++;
          while (/\s/.test(text[j] ?? "")) j++;
          if (text[j] === "[") {
            const end = matchSquareBracket(text, j);
            if (end !== -1) {
              return {
                range: [region.range[0] + j, region.range[0] + end + 1],
                text: text.slice(j, end + 1),
                value,
              };
            }
          }
        }
      }
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return null;
}

function matchSquareBracket(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) return i;
  }
  return -1;
}

export function findUniformObjectArrays(regions: JsonRegion[]): UniformArray[] {
  const result: UniformArray[] = [];

  for (const region of regions) {
    if (Array.isArray(region.value)) {
      const keys = uniformKeys(region.value as Record<string, unknown>[]);
      if (keys) result.push({ region, rows: region.value as Record<string, unknown>[], keys });
      continue;
    }

    if (region.value === null || typeof region.value !== "object") continue;
    for (const [key, value] of Object.entries(region.value as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const keys = uniformKeys(value as Record<string, unknown>[]);
      if (!keys) continue;
      const nested = locateNestedArray(region, key, value);
      if (nested) result.push({ region: nested, rows: value as Record<string, unknown>[], keys });
    }
  }

  return result;
}
