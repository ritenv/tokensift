import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Encoder } from "../encoder.js";
import type { AnthropicCalibration } from "../encoders/anthropic.js";
import { AnthropicEncoder } from "../encoders/anthropic.js";

// CLI-only: the library's resolveEncoder() only ever uses the bundled
// calibration data. A local .tokensift/anthropic-calibration.json (written by
// `tokensift calibrate anthropic run`) overrides it per exact model id, via
// AnalyzeOptions.encoder, without touching the bundled default.
export function resolveAnthropicOverride(
  model: string,
  cwd: string,
  explicitPath?: string,
): Encoder | undefined {
  if (!model.startsWith("claude-")) return undefined;

  const path = explicitPath ?? join(cwd, ".tokensift", "anthropic-calibration.json");
  if (!existsSync(path)) return undefined;

  const store = JSON.parse(readFileSync(path, "utf8")) as Record<string, AnthropicCalibration>;
  const record = store[model];
  return record ? new AnthropicEncoder(model, record) : undefined;
}
