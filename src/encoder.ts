import type { TokenView } from "./types.js";

export type EncoderMode = "exact" | "estimate";

export interface Encoder {
  id: string;
  family: string;
  mode: EncoderMode;
  countTokens(text: string): number;
  tokenize(text: string): TokenView;
}

export class NotImplementedEncoder implements Encoder {
  mode: EncoderMode = "estimate";

  constructor(
    public id: string,
    public family: string,
  ) {}

  countTokens(): number {
    throw new Error(
      `encoder '${this.id}' is not implemented yet; use an OpenAI model or supply a custom Encoder`,
    );
  }

  tokenize(): TokenView {
    throw new Error(
      `encoder '${this.id}' is not implemented yet; use an OpenAI model or supply a custom Encoder`,
    );
  }
}
