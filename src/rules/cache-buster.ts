import { moneyFromPerCallAmount, resolvePricing } from "../pricing.js";
import { defineRule } from "../rule.js";
import { findMessageIndex } from "../services/message-position.js";
import type { Finding } from "../types.js";

const DEFAULT_MIN_TOKENS = 2048;

const WHY =
  "prompt caches match on exact prefixes; dynamic content placed before a large static block invalidates caching for everything after it, so identical static content gets billed at the full rate every call instead of the cache-read discount";

export const cacheBuster = defineRule({
  id: "cache-buster",
  defaultSeverity: "error",
  why: WHY,
  check(ctx, severity) {
    if (ctx.slots.length === 0) return [];

    const firstDynamicStart = ctx.slots.reduce(
      (min, s) => Math.min(min, s.range[0]),
      Number.POSITIVE_INFINITY,
    );
    const region = ctx.text.slice(firstDynamicStart);
    const regionTokens = ctx.encoder.countTokens(region);
    const dynamicTokensInRegion = ctx.slots
      .filter((s) => s.range[0] >= firstDynamicStart)
      .reduce((sum, s) => sum + ctx.encoder.countTokens(s.value ?? ""), 0);
    const lostStaticTokens = regionTokens - dynamicTokensInRegion;

    const minTokens = ctx.providerProfile?.cacheMinTokens ?? DEFAULT_MIN_TOKENS;
    if (lostStaticTokens < minTokens) return [];

    const firstSlot = ctx.slots.find((s) => s.range[0] === firstDynamicStart);
    if (!firstSlot) return [];
    const messageIndex = findMessageIndex(ctx.text, ctx.messages, firstDynamicStart);

    const pricing = resolvePricing(ctx.model, ctx.pricingOverrides);
    const cost =
      pricing?.cacheReadInputCostPerToken !== undefined
        ? moneyFromPerCallAmount(
            lostStaticTokens * (pricing.inputCostPerToken - pricing.cacheReadInputCostPerToken),
            ctx.volume,
          )
        : undefined;

    const where = messageIndex !== undefined ? ` (message ${messageIndex})` : "";

    const finding: Finding = {
      ruleId: "cache-buster",
      severity,
      message: `dynamic content '${firstSlot.name}'${where} sits before ${lostStaticTokens} tokens of static content, blocking it from ever being cached`,
      why: WHY,
      loc: { input: ctx.inputRef, range: firstSlot.range, messageIndex },
      tokens: { current: lostStaticTokens, afterFix: lostStaticTokens, saved: 0 },
      cost,
      suggestion: `move '${firstSlot.name}'${where} after the static content it currently precedes, so the static prefix stays cacheable`,
      confidence: ctx.encoder.mode,
    };

    return [finding];
  },
});
