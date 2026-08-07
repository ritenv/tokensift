import * as cl100k from "gpt-tokenizer/model/gpt-4";
import type { Encoder, EncoderMode } from "../encoder.js";
import type { TokenView } from "../types.js";
import { buildTokenView } from "./openai-shared.js";

/**
 * Exact OpenAI encoder for the cl100k_base family (gpt-4, gpt-4-turbo, gpt-3.5-turbo).
 * Only pulls in the cl100k rank table (~1.1MB), not o200k's, useful for
 * bundle-size-sensitive environments (edge functions) that only ever target
 * one family, pass an instance via `AnalyzeOptions.encoder` to skip the
 * default `resolveEncoder()` path, which loads both families.
 */
export class Cl100kBaseEncoder implements Encoder {
  readonly mode: EncoderMode = "exact";
  readonly family = "cl100k_base";

  constructor(readonly id: string) {}

  countTokens(text: string): number {
    return cl100k.encode(text).length;
  }

  tokenize(text: string): TokenView {
    return buildTokenView(text, cl100k);
  }
}
