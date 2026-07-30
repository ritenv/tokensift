import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const MIN_LEN = 20;
const MAX_CHARS_PER_TOKEN = 3;
const CANDIDATE = /\b[A-Za-z0-9][A-Za-z0-9_-]{19,}[A-Za-z0-9]\b/g;
const SECRET_PREFIX =
  /^(sk-|sk_live_|sk_test_|rk_live_|ghp_|gho_|ghs_|github_pat_|npm_|AKIA|xox[baprs]-|AIza)/;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// enum/status values (PAYMENT_PROCESSING_FAILED) sit right at the chars/token boundary
// because underscores compress worse than prose, not because they carry entropy
const SCREAMING_SNAKE_CASE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

const WHY =
  "random-looking strings (api keys, cache keys, base62 ids) have no word structure for BPE to compress, so they fragment close to character-per-token";

export const highEntropyString = defineRule({
  id: "high-entropy-string",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const match of ctx.text.matchAll(CANDIDATE)) {
      const span = match[0];
      if (span.length < MIN_LEN) continue;
      if (CANONICAL_UUID.test(span)) continue;
      const start = match.index;

      // a credential prefix match bypasses the entropy gate: several real secret formats
      // tokenize efficiently enough to clear it despite being genuine leaked credentials
      const looksLikeSecret = SECRET_PREFIX.test(span);
      if (!looksLikeSecret && SCREAMING_SNAKE_CASE.test(span)) continue;
      const current = ctx.encoder.countTokens(span);
      const charsPerToken = span.length / current;
      if (!looksLikeSecret && charsPerToken > MAX_CHARS_PER_TOKEN) continue;

      findings.push({
        ruleId: "high-entropy-string",
        severity,
        message: `'${span}' costs ${current} tokens (${charsPerToken.toFixed(1)} chars/token)${looksLikeSecret ? ", and looks like a credential" : ""}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, start + span.length] },
        tokens: { current, afterFix: current, saved: 0 },
        suggestion: looksLikeSecret
          ? "this looks like a credential; keep it out of prompts entirely, don't just shorten it"
          : "reference this value by a short id instead of inlining it, if the model doesn't need to read it",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
