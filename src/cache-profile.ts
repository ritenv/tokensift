// Minimum cacheable prefix length, in tokens, per model. Providers silently never cache a
// prefix shorter than this -- below it, a cache-ordering fix wouldn't help either, since
// there's nothing to hit. Sourced from each provider's own prompt-caching docs, not derived.
//
// Anthropic: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
// OpenAI: https://developers.openai.com/api/docs/guides/prompt-caching
// Verified: 2026-08-29

export const CACHE_MIN_TOKENS: Record<string, number> = {
  "claude-opus-4-5": 4096,
  "claude-sonnet-4-5": 1024,
  "claude-haiku-4-5": 4096,
};

// Every currently-bundled OpenAI model predates whatever "GPT-5.6+" refers to in OpenAI's
// docs (which draw the line at 1024 vs 2048), so none can be verified as the newer, lower
// tier. Using the documented "older models" minimum for all of them is a conservative floor,
// not a guess: it never under-warns (a real minimum below this would only make the finding
// fire *more* often, not less), same "don't claim more than we've verified" policy as the
// o1-mini pricing gap in pricing-data.ts.
const OPENAI_DEFAULT_MIN_TOKENS = 2048;

// Same conservative-floor reasoning for any model with no verified entry above.
const FALLBACK_MIN_TOKENS = 2048;

export function resolveCacheMinTokens(model: string, provider: string | undefined): number {
  const verified = CACHE_MIN_TOKENS[model];
  if (verified !== undefined) return verified;
  return provider === "openai" ? OPENAI_DEFAULT_MIN_TOKENS : FALLBACK_MIN_TOKENS;
}
