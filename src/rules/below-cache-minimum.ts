import { defineRule } from "../rule.js";
import { findMessageIndex } from "../services/message-position.js";
import type { Finding } from "../types.js";

const DEFAULT_MIN_TOKENS = 2048;

const WHY =
  "providers enforce a minimum cacheable prefix length; a static prefix shorter than that silently never caches, no matter how well the rest of the prompt is ordered";

export const belowCacheMinimum = defineRule({
  id: "below-cache-minimum",
  defaultSeverity: "info",
  why: WHY,
  check(ctx, severity) {
    if (ctx.slots.length === 0) return [];

    const firstDynamicStart = ctx.slots.reduce(
      (min, s) => Math.min(min, s.range[0]),
      Number.POSITIVE_INFINITY,
    );
    const prefixTokens = ctx.encoder.countTokens(ctx.text.slice(0, firstDynamicStart));
    if (prefixTokens === 0) return [];

    const minTokens = ctx.providerProfile?.cacheMinTokens ?? DEFAULT_MIN_TOKENS;
    if (prefixTokens >= minTokens) return [];

    const messageIndex = findMessageIndex(ctx.text, ctx.messages, 0);

    const finding: Finding = {
      ruleId: "below-cache-minimum",
      severity,
      message: `static prefix (${prefixTokens} tokens) is below ${ctx.model}'s minimum cacheable length (${minTokens} tokens), it will never be cached`,
      why: WHY,
      loc: { input: ctx.inputRef, range: [0, firstDynamicStart], messageIndex },
      tokens: { current: prefixTokens, afterFix: prefixTokens, saved: 0 },
      suggestion:
        "add more static content before the dynamic part, or don't rely on caching for this prompt",
      confidence: ctx.encoder.mode,
    };

    return [finding];
  },
});
