import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { digitFragmentation } from "../src/rules/digit-fragmentation.js";

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// independent oracle: construct the date and read its components back. JS Date silently
// rolls an out-of-range date over to a real one (Feb 30 -> Mar 2) instead of rejecting it,
// so round-tripping through the components is what actually detects that, same technique
// the rule itself uses, but implemented separately here so the test isn't just checking the
// rule against itself.
function isReallyValidDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour > 23) return false;
  if (minute > 59) return false;
  if (second > 59) return false;
  // Date.UTC(year, ...) has a legacy quirk: a year in 0-99 gets treated as 1900+year.
  // setUTCFullYear takes the year literally, so it avoids that trap.
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute &&
    d.getUTCSeconds() === second
  );
}

interface TimestampParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// year is padded to 4 digits to match the rule's \d{4} regex; excludes the leap-second
// (:60) case deliberately, that's a separate documented special case, not calendar math.
const timestampParts: fc.Arbitrary<TimestampParts> = fc.record({
  year: fc.integer({ min: 1, max: 9999 }),
  month: fc.integer({ min: 1, max: 15 }),
  day: fc.integer({ min: 1, max: 35 }),
  hour: fc.integer({ min: 0, max: 26 }),
  minute: fc.integer({ min: 0, max: 65 }),
  second: fc.integer({ min: 0, max: 59 }),
});

function toTimestamp(p: TimestampParts): string {
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}T${pad(p.hour, 2)}:${pad(p.minute, 2)}:${pad(p.second, 2)}Z`;
}

describe("digit-fragmentation (property-based)", () => {
  it("never crashes on arbitrary digit-heavy text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (text) => {
        expect(() => analyze(text, { model: "gpt-4o", rules: [digitFragmentation] })).not.toThrow();
      }),
    );
  });

  it("never flags a timestamp whose calendar date isn't really valid", () => {
    fc.assert(
      fc.property(timestampParts, (p) => {
        fc.pre(!isReallyValidDate(p.year, p.month, p.day, p.hour, p.minute, p.second));
        const timestamp = toTimestamp(p);
        const report = analyze(`event at ${timestamp} occurred`, {
          model: "gpt-4o",
          rules: [digitFragmentation],
        });
        expect(report.findings).toEqual([]);
      }),
    );
  });

  it("when it does fire, the suggested epoch value is numerically correct", () => {
    fc.assert(
      fc.property(timestampParts, (p) => {
        fc.pre(isReallyValidDate(p.year, p.month, p.day, p.hour, p.minute, p.second));
        const timestamp = toTimestamp(p);
        const report = analyze(`event at ${timestamp} occurred`, {
          model: "gpt-4o",
          rules: [digitFragmentation],
        });
        if (report.findings.length === 0) return; // no token savings for this string, fine
        const epochMatch = report.findings[0]!.message.match(/\('(-?\d+)'\)/);
        expect(epochMatch).not.toBeNull();
        const reportedEpoch = Number(epochMatch![1]);
        const realMs = Date.parse(timestamp);
        const expected = report.findings[0]!.message.includes("epoch milliseconds")
          ? realMs
          : Math.floor(realMs / 1000);
        expect(reportedEpoch).toBe(expected);
      }),
    );
  });
});
