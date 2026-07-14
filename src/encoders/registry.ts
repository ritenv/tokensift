export type OpenAiFamily = "o200k_base" | "cl100k_base";

// gpt-tokenizer ships per-model subpaths with the correct bundled BPE ranks,
// so we only import one representative model per family (ranks are shared
// within a family). This list is intentionally small; extend it as rules
// need more models.
export const OPENAI_MODEL_FAMILY: Record<string, OpenAiFamily> = {
  "gpt-4o": "o200k_base",
  "gpt-4o-mini": "o200k_base",
  "gpt-4.1": "o200k_base",
  "gpt-4-turbo": "cl100k_base",
  "gpt-4": "cl100k_base",
  "gpt-3.5-turbo": "cl100k_base",
};

export function resolveOpenAiFamily(model: string): OpenAiFamily {
  const family = OPENAI_MODEL_FAMILY[model];
  if (!family) {
    throw new Error(
      `unknown OpenAI model '${model}'; supported: ${Object.keys(OPENAI_MODEL_FAMILY).join(", ")}`,
    );
  }
  return family;
}
