import type { JsonRegion } from "../types.js";

const CLOSERS: Record<string, string> = { "{": "}", "[": "]" };

export function findJsonRegions(text: string): JsonRegion[] {
  const regions: JsonRegion[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text[i]!;
    const close = CLOSERS[open];
    if (!close) {
      i++;
      continue;
    }
    const end = matchBracket(text, i, open, close);
    if (end === -1) {
      i++;
      continue;
    }
    const candidate = text.slice(i, end + 1);
    const value = parseJsonTolerantly(candidate);
    if (value === NOT_JSON) {
      i++;
      continue;
    }
    // An empty object/array carries no structural data to flag (no keys to shorten, no
    // rows to tabulate, nothing to minify) and is a common false-positive source: markdown
    // checkbox syntax "- [ ]" parses as a valid empty JSON array.
    if (isTrivial(value)) {
      i++;
      continue;
    }
    regions.push({ range: [i, end + 1], text: candidate, value });
    i = end + 1;
  }
  return regions;
}

const NOT_JSON = Symbol("not-json");

// Real authors regularly write "JSON-shaped" text with soft-wrapped, multi-line string values
// (pasting a multi-sentence note into a JSON template, say) without escaping the newlines --
// invalid per the JSON grammar, but recognizably JSON to a human reader. A strict JSON.parse
// treats the whole surrounding region as unparseable, which silently hides it from
// pretty-json/row-json/long-keys and leaves its structural repetition looking like plain text
// to repeated-block. Retry with literal control characters inside string values escaped before
// giving up, so this common near-miss still gets picked up as a real region.
function parseJsonTolerantly(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(escapeRawControlCharsInStrings(candidate));
    } catch {
      return NOT_JSON;
    }
  }
}

function escapeRawControlCharsInStrings(text: string): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        result += ch + text[i + 1];
        i++;
        continue;
      }
      if (ch === '"') {
        inString = false;
        result += ch;
        continue;
      }
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
      result += ch;
      continue;
    }
    if (ch === '"') inString = true;
    result += ch;
  }
  return result;
}

function isTrivial(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value !== null && typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function matchBracket(text: string, start: number, open: string, close: string): number {
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
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return -1;
}
