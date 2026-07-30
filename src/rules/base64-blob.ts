import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const MIN_LEN = 64;
const MAX_CHARS_PER_TOKEN = 3;
const DATA_URI = /data:[\w+\-.]+;base64,[A-Za-z0-9+/=]+/g;

// lookaround instead of \b: \b treats "_" as a word char, so "blob_<base64>" wouldn't match.
const STANDALONE = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{64,}={0,2}(?![A-Za-z0-9+/])/g;

// base64url's alphabet is a near-superset of identifier characters, so a blanket charset scan
// swallows package names and hostnames. Detected structurally instead (three dot-separated
// segments, JWTs' real shape) plus the chars-per-token gate below as a second guard.
const JWT_SHAPED =
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9_-])/g;

const NON_HEX = /[g-zG-Z+/_-]/;

const WHY =
  "base64 has no word structure for BPE to compress, so it runs close to 1 token per 1.3-1.5 characters; embedded files routinely cost thousands of tokens";

export const base64Blob = defineRule({
  id: "base64-blob",
  defaultSeverity: "error",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    const claimed = new Set<number>();

    function overlapsClaimed(start: number, length: number): boolean {
      for (let i = start; i < start + length; i++) {
        if (claimed.has(i)) return true;
      }
      return false;
    }

    for (const match of ctx.text.matchAll(DATA_URI)) {
      report(match[0], match.index);
    }
    // before STANDALONE: a JWT's middle segment alone can satisfy STANDALONE's alphabet too,
    // so claiming the full JWT span first stops it being reported twice.
    for (const match of ctx.text.matchAll(JWT_SHAPED)) {
      if (overlapsClaimed(match.index, match[0].length)) continue;
      if (match[0].length < MIN_LEN) continue;
      const charsPerToken = match[0].length / ctx.encoder.countTokens(match[0]);
      if (charsPerToken > MAX_CHARS_PER_TOKEN) continue;
      report(match[0], match.index);
    }
    for (const match of ctx.text.matchAll(STANDALONE)) {
      if (overlapsClaimed(match.index, match[0].length)) continue;
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
