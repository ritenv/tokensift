import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const ISO_TIMESTAMP =
  /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?\b/g;

const WHY =
  "long digit runs split into 1-3 digit tokens each; a full ISO-8601 timestamp tokenizes far worse than the epoch seconds it represents";

function daysInMonth(year: number, month: number): number {
  // day 0 of a given (1-indexed) month is the last day of the month before it
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Date.parse silently rolls an invalid date like Feb 30 over to a real one (March 1st or
// 2nd) instead of rejecting it -- confidently suggesting an epoch "equivalent" for a
// timestamp that was never a real calendar date to begin with. Validating the components
// directly, before trusting Date.parse's result, catches that instead of propagating it.
function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23) return false;
  if (minute > 59) return false;
  if (second > 60) return false; // 60 allows a leap second
  return true;
}

export const digitFragmentation = defineRule({
  id: "digit-fragmentation",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const match of ctx.text.matchAll(ISO_TIMESTAMP)) {
      const timestamp = match[0];
      const [, year, month, day, hour, minute, second, fraction] = match;
      const isValid = isValidCalendarDate(
        Number(year),
        Number(month),
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      );
      if (!isValid) continue;

      const ms = Date.parse(timestamp);
      if (Number.isNaN(ms)) continue;
      const start = match.index;

      // a timestamp with a fractional-seconds component carries real sub-second precision;
      // truncating to epoch seconds would silently drop it, so suggest epoch milliseconds
      // instead for exactly that case.
      const hasSubSecondPrecision = Boolean(fraction);
      const epoch = hasSubSecondPrecision ? String(ms) : String(Math.floor(ms / 1000));
      const epochLabel = hasSubSecondPrecision ? "epoch milliseconds" : "epoch seconds";

      const current = ctx.encoder.countTokens(timestamp);
      const afterFix = ctx.encoder.countTokens(epoch);
      if (afterFix >= current) continue;

      findings.push({
        ruleId: "digit-fragmentation",
        severity,
        message: `timestamp '${timestamp}' costs ${current} tokens, ${epochLabel} ('${epoch}') costs ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + timestamp.length] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion: `store and pass ${epochLabel}; format as a human-readable date only where it's displayed`,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
