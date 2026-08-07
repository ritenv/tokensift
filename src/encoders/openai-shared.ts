import type { TokenClass, TokenView } from "../types.js";

// deliberately has no gpt-tokenizer import: kept separate from openai-cl100k.ts
// and openai-o200k.ts so importing one family's encoder never pulls the other
// family's multi-megabyte BPE rank table along with it (see DESIGN.md).
export interface TokenizerModule {
  encode(text: string): number[];
  decode(ids: number[]): string;
}

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

export function buildTokenView(text: string, mod: TokenizerModule): TokenView {
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
  let line = 0;
  const perLineCosts: number[] = [0];
  for (const id of ids) {
    const tokText = mod.decode([id]);
    const byteLen = textEncoder.encode(tokText).length;
    tokens.push({ text: tokText, id, byteRange: [byteOffset, byteOffset + byteLen] });
    byteOffset += byteLen;
    const cls = classify(tokText);
    classHistogram[cls] += 1;
    if (cls === "whitespace") whitespaceTokens += 1;

    // a token is charged to whichever line it starts on; if its own text
    // crosses a newline (rare, but "\n\n" is a real single token) later
    // tokens land on the line after
    perLineCosts[line] = (perLineCosts[line] ?? 0) + 1;
    for (const ch of tokText) {
      if (ch === "\n") {
        line += 1;
        perLineCosts[line] = 0;
      }
    }
  }
  return {
    text,
    tokens,
    count: tokens.length,
    stats: {
      charsPerToken: tokens.length === 0 ? 0 : text.length / tokens.length,
      whitespaceShare: tokens.length === 0 ? 0 : whitespaceTokens / tokens.length,
      classHistogram,
      perLineCosts,
    },
  };
}
