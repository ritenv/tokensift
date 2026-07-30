import { defineRule } from "../rule.js";
import { findUniformObjectArrays } from "../services/data-rows.js";
import type { Finding } from "../types.js";

const WHY =
  "row-oriented JSON repeats every key on every element; for N rows the key names alone cost N times over, columnar or tabular layouts pay for them once";

function csvEscape(value: unknown): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(keys: string[], rows: Record<string, unknown>[]): string {
  const lines = [keys.join(",")];
  for (const row of rows) lines.push(keys.map((k) => csvEscape(row[k])).join(","));
  return lines.join("\n");
}

function toColumnar(keys: string[], rows: Record<string, unknown>[]): string {
  return JSON.stringify({ keys, rows: rows.map((row) => keys.map((k) => row[k])) });
}

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

// CSV cells go through String(value), which collapses a nested object/array to the literal
// text "[object Object]" instead of its contents -- lossy, so only offered when every cell
// is a primitive; columnar JSON round-trips via JSON.stringify and stays lossless either way.
function hasNestedValues(rows: Record<string, unknown>[], keys: string[]): boolean {
  return rows.some((row) => keys.some((key) => !isPrimitive(row[key])));
}

export const rowJson = defineRule({
  id: "row-json",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const { region, rows, keys } of findUniformObjectArrays(ctx.jsonRegions)) {
      const current = ctx.encoder.countTokens(region.text);

      const columnar = toColumnar(keys, rows);
      const columnarTokens = ctx.encoder.countTokens(columnar);
      let best = { label: "columnar JSON", tokens: columnarTokens };

      if (!hasNestedValues(rows, keys)) {
        const csv = toCsv(keys, rows);
        const csvTokens = ctx.encoder.countTokens(csv);
        if (csvTokens <= columnarTokens) best = { label: "CSV", tokens: csvTokens };
      }
      if (best.tokens >= current) continue;

      const [start, end] = region.range;
      findings.push({
        ruleId: "row-json",
        severity,
        message: `row-oriented JSON (${rows.length} rows) costs ${current} tokens; ${best.label} costs ${best.tokens}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix: best.tokens, saved: current - best.tokens },
        suggestion: `restructure as ${best.label} if the model doesn't need per-row JSON objects`,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
