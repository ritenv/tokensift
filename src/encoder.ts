import { ANTHROPIC_CALIBRATIONS } from "./encoders/anthropic-calibration.js";
import { AnthropicEncoder } from "./encoders/anthropic.js";
import { OpenAiEncoder } from "./encoders/openai.js";
import { OPENAI_MODEL_FAMILY } from "./encoders/registry.js";
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

// cheap, sync family lookup for callers that only need to know which family a model
// string implies (encoder-mismatch) without constructing a real encoder, so they don't
// need to become async just to read one field. Returns undefined for anything resolveEncoder
// itself would reject, so a caller can tell "no answer" apart from a real mismatch.
export function resolveEncoderFamily(model: string): string | undefined {
  if (model in OPENAI_MODEL_FAMILY) return OPENAI_MODEL_FAMILY[model];
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "gemini";
  return undefined;
}

export async function resolveEncoder(model: string): Promise<Encoder> {
  if (model in OPENAI_MODEL_FAMILY) return OpenAiEncoder.create(model);
  if (model.startsWith("claude-")) {
    const calibration = ANTHROPIC_CALIBRATIONS[model];
    if (!calibration) {
      const known = Object.keys(ANTHROPIC_CALIBRATIONS);
      const knownList = known.length > 0 ? known.join(", ") : "none yet";
      throw new Error(
        `no calibration data for '${model}'; calibrated models: ${knownList}. Run \`tokensift calibrate anthropic\` to add one`,
      );
    }
    return new AnthropicEncoder(model, calibration);
  }
  if (model.startsWith("gemini-")) return new NotImplementedEncoder(model, "gemini");
  throw new Error(`unknown model '${model}'; pass a custom Encoder via options.encoder`);
}
