import type { Encoder, EncoderMode } from "../encoder.js";
import type { TokenView } from "../types.js";
import { type OpenAiFamily, resolveOpenAiFamily } from "./registry.js";

// convenience encoder for any supported OpenAI model id. create() dynamically imports only
// the rank table the resolved family actually needs, so a caller who doesn't know the family
// upfront still only pays for one, not both.
export class OpenAiEncoder implements Encoder {
  readonly mode: EncoderMode = "exact";

  private constructor(
    readonly id: string,
    readonly family: OpenAiFamily,
    private readonly delegate: Encoder,
  ) {}

  static async create(id: string): Promise<OpenAiEncoder> {
    const family = resolveOpenAiFamily(id);
    const delegate =
      family === "o200k_base"
        ? new (await import("./openai-o200k.js")).O200kBaseEncoder(id)
        : new (await import("./openai-cl100k.js")).Cl100kBaseEncoder(id);
    return new OpenAiEncoder(id, family, delegate);
  }

  countTokens(text: string): number {
    return this.delegate.countTokens(text);
  }

  tokenize(text: string): TokenView {
    return this.delegate.tokenize(text);
  }
}
