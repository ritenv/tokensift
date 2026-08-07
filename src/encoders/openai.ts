import type { Encoder, EncoderMode } from "../encoder.js";
import type { TokenView } from "../types.js";
import { Cl100kBaseEncoder } from "./openai-cl100k.js";
import { O200kBaseEncoder } from "./openai-o200k.js";
import { type OpenAiFamily, resolveOpenAiFamily } from "./registry.js";

// convenience encoder for any supported OpenAI model id, resolves the family
// at construction time. Loads both cl100k and o200k rank tables regardless of
// which family it ends up using, that's the tradeoff for not needing the
// caller to know the family upfront; bundle-size-sensitive callers should
// import Cl100kBaseEncoder/O200kBaseEncoder directly instead (see DESIGN.md).
export class OpenAiEncoder implements Encoder {
  readonly mode: EncoderMode = "exact";
  readonly family: OpenAiFamily;
  private readonly delegate: Encoder;

  constructor(readonly id: string) {
    this.family = resolveOpenAiFamily(id);
    this.delegate =
      this.family === "o200k_base" ? new O200kBaseEncoder(id) : new Cl100kBaseEncoder(id);
  }

  countTokens(text: string): number {
    return this.delegate.countTokens(text);
  }

  tokenize(text: string): TokenView {
    return this.delegate.tokenize(text);
  }
}
