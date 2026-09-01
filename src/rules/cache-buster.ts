import { moneyFromPerCallAmount, resolvePricing } from "../pricing.js";
import { defineRule } from "../rule.js";
import type { Finding, Message } from "../types.js";

const DEFAULT_MIN_TOKENS = 2048;

const WHY =
  "prompt caches match on exact prefixes; dynamic content placed before a large static block invalidates caching for everything after it, so identical static content gets billed at the full rate every call instead of the cache-read discount";

function messageText(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join("");
}

// same indexOf-with-advancing-cursor technique duplicate-message-content.ts already uses to
// locate a message's own span inside ctx.text, reused here to attribute a slot position back
// to the message it came from, without replicating normalize()'s exact join logic.
function findMessageIndex(
  text: string,
  messages: Message[] | undefined,
  position: number,
): number | undefined {
  if (!messages) return undefined;
  let cursor = 0;
  for (let i = 0; i < messages.length; i++) {
    const content = messageText(messages[i]!);
    if (!content) continue;
    const offset = text.indexOf(content, cursor);
    if (offset === -1) continue;
    cursor = offset + content.length;
    if (position >= offset && position < cursor) return i;
  }
  return undefined;
}

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
