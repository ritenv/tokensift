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
    try {
      const value = JSON.parse(candidate);
      regions.push({ range: [i, end + 1], text: candidate, value });
      i = end + 1;
    } catch {
      i++;
    }
  }
  return regions;
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
