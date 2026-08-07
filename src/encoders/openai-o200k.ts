import * as o200k from "gpt-tokenizer/model/gpt-4o";
import type { Encoder, EncoderMode } from "../encoder.js";
import type { TokenView } from "../types.js";
import { buildTokenView } from "./openai-shared.js";

/**
 * Exact OpenAI encoder for the o200k_base family (gpt-4o, gpt-4o-mini, gpt-4.1).
 * Only pulls in the o200k rank table (~2.2MB), not cl100k's, useful for
 * bundle-size-sensitive environments (edge functions) that only ever target
 * one family, pass an instance via `AnalyzeOptions.encoder` to skip the
 * default `resolveEncoder()` path, which loads both families.
 */
export class O200kBaseEncoder implements Encoder {
  readonly mode: EncoderMode = "exact";
  readonly family = "o200k_base";

  constructor(readonly id: string) {}

  countTokens(text: string): number {
    return o200k.encode(text).length;
  }

  tokenize(text: string): TokenView {
    return buildTokenView(text, o200k);
  }
}
