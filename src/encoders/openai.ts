import * as cl100k from "gpt-tokenizer/model/gpt-4";
import * as o200k from "gpt-tokenizer/model/gpt-4o";
import type { Encoder, EncoderMode } from "../encoder.js";
import type { TokenClass, TokenView } from "../types.js";
import { type OpenAiFamily, resolveOpenAiFamily } from "./registry.js";

interface TokenizerModule {
  encode(text: string): number[];
  decode(ids: number[]): string;
}

const FAMILY_MODULES: Record<OpenAiFamily, TokenizerModule> = {
  o200k_base: o200k,
  cl100k_base: cl100k,
};

const textEncoder = new TextEncoder();

function classify(tokenText: string): TokenClass {
  const trimmed = tokenText.trim();
  if (trimmed.length === 0) return "whitespace";
  if (/^\d+$/.test(trimmed)) return "digit-fragment";
  if (/^[0-9a-fA-F]+$/.test(trimmed) && /[a-fA-F]/.test(trimmed)) return "hex-fragment";
  if (/^[a-zA-Z]+$/.test(trimmed)) return "word";
  if (/^[\p{P}\p{S}]+$/u.test(trimmed)) return "punct";
  return "other";
}

function buildTokenView(text: string, mod: TokenizerModule): TokenView {
  const ids = mod.encode(text);
  const tokens: TokenView["tokens"] = [];
  const classHistogram: Record<TokenClass, number> = {
    word: 0,
    punct: 0,
    whitespace: 0,
    "digit-fragment": 0,
    "hex-fragment": 0,
    other: 0,
  };
  let byteOffset = 0;
  let whitespaceTokens = 0;
  for (const id of ids) {
    const tokText = mod.decode([id]);
    const byteLen = textEncoder.encode(tokText).length;
    tokens.push({ text: tokText, id, byteRange: [byteOffset, byteOffset + byteLen] });
    byteOffset += byteLen;
    const cls = classify(tokText);
    classHistogram[cls] += 1;
    if (cls === "whitespace") whitespaceTokens += 1;
  }
  return {
    text,
    tokens,
    count: tokens.length,
    stats: {
      charsPerToken: tokens.length === 0 ? 0 : text.length / tokens.length,
      whitespaceShare: tokens.length === 0 ? 0 : whitespaceTokens / tokens.length,
      classHistogram,
    },
  };
}

export class OpenAiEncoder implements Encoder {
  readonly mode: EncoderMode = "exact";
  readonly family: OpenAiFamily;
  private readonly mod: TokenizerModule;

  constructor(readonly id: string) {
    this.family = resolveOpenAiFamily(id);
    this.mod = FAMILY_MODULES[this.family];
  }

  countTokens(text: string): number {
    return this.mod.encode(text).length;
  }

  tokenize(text: string): TokenView {
    return buildTokenView(text, this.mod);
  }
}
