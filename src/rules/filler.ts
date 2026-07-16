import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const PHRASES = [
  "i was wondering if you could",
  "if it's not too much trouble",
  "if you don't mind",
  "please kindly",
  "i would really appreciate it if",
  "please feel free to",
  "it would be great if you could",
  "sorry to bother you but",
  "just wanted to check",
  "no worries if not",
  "i hope this makes sense, but",
  "as you probably already know",
];

const PATTERN = new RegExp(PHRASES.map((p) => p.replace(/'/g, "['’]")).join("|"), "gi");

const WHY =
  "politeness and hedging phrases are measurable token cost with no instruction content; the model doesn't need to be asked nicely";

function insideSlot(range: [number, number], slots: { range: [number, number] }[]): boolean {
  return slots.some((slot) => range[0] >= slot.range[0] && range[1] <= slot.range[1]);
}

export const filler = defineRule({
  id: "filler",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const hits: { start: number; end: number }[] = [];

    for (const match of ctx.text.matchAll(PATTERN)) {
      const start = match.index;
      const end = start + match[0].length;
      if (insideSlot([start, end], ctx.slots)) continue;
      hits.push({ start, end });
    }

    if (hits.length === 0) return [];

    const current = hits.reduce(
      (sum, hit) => sum + ctx.encoder.countTokens(ctx.text.slice(hit.start, hit.end)),
      0,
    );
    const first = hits[0]!;
    const last = hits[hits.length - 1]!;

    const finding: Finding = {
      ruleId: "filler",
      severity,
      message: `${hits.length} filler phrase${hits.length > 1 ? "s" : ""} cost ${current} tokens with no instruction content`,
      why: WHY,
      loc: { input: ctx.inputRef, range: [first.start, last.end] },
      tokens: { current, afterFix: 0, saved: current },
      suggestion: "state the request directly, drop the hedging",
      confidence: ctx.encoder.mode,
    };

    return [finding];
  },
});
