import { resolveEncoder } from "../encoder.js";
import { defineRule } from "../rule.js";
import type { Finding } from "../types.js";

const WHY =
  "counting with the wrong tokenizer family (e.g. an Anthropic encoder while the model string says an OpenAI model) yields systematically wrong token counts";

// options.model is required even when options.encoder overrides resolveEncoder(model),
// e.g. a locally-calibrated Claude model resolveEncoder doesn't know about (see
// AnalyzeOptions.encoder's own doc comment), so resolveEncoder(ctx.model) throwing here
// isn't a mismatch, it just means there's nothing to compare against.
export const encoderMismatch = defineRule({
  id: "encoder-mismatch",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    let expectedFamily: string;
    try {
      expectedFamily = resolveEncoder(ctx.model).family;
    } catch {
      return [];
    }

    if (expectedFamily === ctx.encoder.family) return [];

    const current = ctx.tokenView.count;
    const findings: Finding[] = [
      {
        ruleId: "encoder-mismatch",
        severity,
        message: `model '${ctx.model}' normally resolves to a '${expectedFamily}' encoder, but analysis ran with a '${ctx.encoder.family}' one`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [0, ctx.text.length] },
        tokens: { current, afterFix: current, saved: 0 },
        suggestion:
          "pass an encoder that matches the configured model, or update the model string to match the encoder",
        confidence: ctx.encoder.mode,
      },
    ];

    return findings;
  },
});
