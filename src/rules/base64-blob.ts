import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const MIN_LEN = 64;
const DATA_URI = /data:[\w+\-.]+;base64,[A-Za-z0-9+/=]+/g;
const STANDALONE = /\b[A-Za-z0-9+/]{64,}={0,2}(?!\w)/g;
const NON_HEX = /[g-zG-Z+/]/;

const WHY =
  "base64 has no word structure for BPE to compress, so it runs close to 1 token per 1.3-1.5 characters; embedded files routinely cost thousands of tokens";

export const base64Blob = defineRule({
  id: "base64-blob",
  defaultSeverity: "error",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    const claimed = new Set<number>();

    for (const match of ctx.text.matchAll(DATA_URI)) {
      report(match[0], match.index);
    }
    for (const match of ctx.text.matchAll(STANDALONE)) {
      if (claimed.has(match.index)) continue;
      if (!NON_HEX.test(match[0])) continue;
      report(match[0], match.index);
    }

    return findings;

    function report(blob: string, start: number) {
      for (let i = start; i < start + blob.length; i++) claimed.add(i);
      if (blob.length < MIN_LEN) return;

      const current = ctx.encoder.countTokens(blob);
      const replacement = "[file-1]";
      const afterFix = ctx.encoder.countTokens(replacement);
      findings.push({
        ruleId: "base64-blob",
        severity,
        message: `base64 blob (${blob.length} chars) costs ${current} tokens`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + blob.length] },
        tokens: { current, afterFix, saved: current - afterFix },
        suggestion:
          "pass the file through the provider's file/image API or a reference id instead of inlining it",
        confidence: ctx.encoder.mode,
      });
    }
  },
});
