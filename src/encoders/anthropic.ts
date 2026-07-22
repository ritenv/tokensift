import type { Encoder, EncoderMode } from "../encoder.js";
import type { TokenClass, TokenSpan, TokenView } from "../types.js";

export interface AnthropicCalibration {
  model: string;
  ratios: Record<TokenClass, number>; // chars per token, per class
  sampleCount: number;
  measuredAt: string; // ISO date
  meanAbsPercentError: number;
}

export const TOKEN_CLASSES: TokenClass[] = [
  "word",
  "punct",
  "whitespace",
  "digit-fragment",
  "hex-fragment",
  "other",
];

interface ClassRun {
  class: TokenClass;
  text: string;
}

// same TokenClass buckets the OpenAI encoder reports, but classified from raw
// character runs instead of decoded BPE tokens, since there's no real BPE here
function broadCategory(ch: string): "alnum" | "whitespace" | "punct" | "other" {
  if (/\s/.test(ch)) return "whitespace";
  if (/[0-9a-zA-Z]/.test(ch)) return "alnum";
  if (/[\p{P}\p{S}]/u.test(ch)) return "punct";
  return "other";
}

function classifyAlnumRun(text: string): TokenClass {
  if (/^\d+$/.test(text)) return "digit-fragment";
  // length gate avoids misreading a short word like "a" or "bee" as hex
  // just because it's spelled with hex-valid letters
  if (text.length >= 4 && /^[0-9a-fA-F]+$/.test(text) && /[a-fA-F]/.test(text)) {
    return "hex-fragment";
  }
  if (/^[a-zA-Z]+$/.test(text)) return "word";
  return "other";
}

export function segmentByClass(text: string): ClassRun[] {
  const runs: ClassRun[] = [];
  let i = 0;
  while (i < text.length) {
    const broad = broadCategory(text[i]!);
    let j = i + 1;
    while (j < text.length && broadCategory(text[j]!) === broad) j++;
    const runText = text.slice(i, j);
    const cls = broad === "alnum" ? classifyAlnumRun(runText) : broad;
    runs.push({ class: cls, text: runText });
    i = j;
  }
  return runs;
}

const textEncoder = new TextEncoder();

// real BPE vocabularies routinely merge a short run of whitespace into the
// following token (" the" is one token, not " " + "the"), so a lone space or
// two shouldn't cost its own synthetic token here either -- it rides along
// with whatever comes next. Only whitespace runs longer than this actually
// cost tokens on their own, matching this project's own whitespace-run rule
// (DESIGN.md: "short runs are basically free").
const WHITESPACE_MERGE_THRESHOLD = 2;

function mergeShortWhitespace(runs: ClassRun[]): ClassRun[] {
  const merged: ClassRun[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    const next = runs[i + 1];
    if (run.class === "whitespace" && run.text.length <= WHITESPACE_MERGE_THRESHOLD && next) {
      merged.push({ class: next.class, text: run.text + next.text });
      i++;
      continue;
    }
    merged.push(run);
  }
  return merged;
}

// the actual unit of estimation: segmented, then short whitespace folded into
// its neighbor. Calibration fits against this same unit, not raw segmentByClass,
// so what's being fit matches what tokenize()/countTokens() actually predict from.
export function estimationRuns(text: string): ClassRun[] {
  return mergeShortWhitespace(segmentByClass(text));
}

export function buildEstimateView(text: string, calibration: AnthropicCalibration): TokenView {
  const runs = estimationRuns(text);
  const tokens: TokenSpan[] = [];
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
  let id = 0;

  for (const run of runs) {
    const ratio = calibration.ratios[run.class];
    const n = Math.max(1, Math.ceil(run.text.length / ratio));
    const charsPerSubtoken = run.text.length / n;
    for (let k = 0; k < n; k++) {
      const start = Math.round(k * charsPerSubtoken);
      const end = k === n - 1 ? run.text.length : Math.round((k + 1) * charsPerSubtoken);
      const subText = run.text.slice(start, end);
      const byteLen = textEncoder.encode(subText).length;
      tokens.push({ text: subText, id: id++, byteRange: [byteOffset, byteOffset + byteLen] });
      byteOffset += byteLen;
      classHistogram[run.class] += 1;
      if (run.class === "whitespace") whitespaceTokens += 1;
      perLineCosts[line] = (perLineCosts[line] ?? 0) + 1;
      for (const ch of subText) {
        if (ch === "\n") {
          line += 1;
          perLineCosts[line] = 0;
        }
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

export class AnthropicEncoder implements Encoder {
  readonly mode: EncoderMode = "estimate";
  readonly family = "anthropic";

  constructor(
    readonly id: string,
    private readonly calibration: AnthropicCalibration,
  ) {}

  countTokens(text: string): number {
    return this.tokenize(text).count;
  }

  tokenize(text: string): TokenView {
    return buildEstimateView(text, this.calibration);
  }
}
