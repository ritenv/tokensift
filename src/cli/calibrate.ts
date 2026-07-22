import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AnthropicCalibration } from "../encoders/anthropic.js";
import { TOKEN_CLASSES, buildEstimateView, estimationRuns } from "../encoders/anthropic.js";
import type { TokenClass } from "../types.js";
import { requireValue } from "./args.js";
import type { RunResult } from "./types.js";

const PLACEHOLDER_MARKER = "REPLACE ME";
const MIN_SAMPLES = 20;
const INITIAL_RATIO = 4; // starting point for the fixed-point fit, not the answer
const FIT_ITERATIONS = 8;

interface FixturesFile {
  _readme?: string;
  samples: { text: string }[];
}

function zeroByClass(): Record<TokenClass, number> {
  return { word: 0, punct: 0, whitespace: 0, "digit-fragment": 0, "hex-fragment": 0, other: 0 };
}

interface MeasuredSample {
  text: string;
  actualTokens: number;
}

// fits one chars-per-token ratio per class via a small fixed-point iteration:
// each round, attribute every sample's actual token count across classes in
// proportion to what the *current* ratios would already predict for that class
// (not proportional to raw char share -- a class with a much larger ratio, like
// whitespace, genuinely earns a smaller token share per char than a dense class
// like punctuation, and naive char-share attribution ignores that entirely).
// Simpler than a joint least-squares solve over all classes at once, and
// converges to the same answer when the data actually fits a per-class model.
function fitRatios(samples: MeasuredSample[]): {
  ratios: Record<TokenClass, number>;
  meanAbsPercentError: number;
} {
  const charsPerSample = samples.map((sample) => {
    const chars = zeroByClass();
    for (const run of estimationRuns(sample.text)) chars[run.class] += run.text.length;
    return chars;
  });

  let ratios = zeroByClass();
  for (const cls of TOKEN_CLASSES) ratios[cls] = INITIAL_RATIO;

  for (let iter = 0; iter < FIT_ITERATIONS; iter++) {
    const charsTotal = zeroByClass();
    const tokensAttributed = zeroByClass();

    for (let i = 0; i < samples.length; i++) {
      const chars = charsPerSample[i]!;
      const predicted = zeroByClass();
      let predictedTotal = 0;
      for (const cls of TOKEN_CLASSES) {
        predicted[cls] = chars[cls] / ratios[cls];
        predictedTotal += predicted[cls];
      }
      const scale = predictedTotal > 0 ? samples[i]!.actualTokens / predictedTotal : 0;
      for (const cls of TOKEN_CLASSES) {
        charsTotal[cls] += chars[cls];
        tokensAttributed[cls] += predicted[cls] * scale;
      }
    }

    const next = zeroByClass();
    for (const cls of TOKEN_CLASSES) {
      next[cls] = tokensAttributed[cls] > 0 ? charsTotal[cls] / tokensAttributed[cls] : ratios[cls];
    }
    ratios = next;
  }

  // the fit above treats chars/ratio as continuous, but the real estimator
  // (buildEstimateView) rounds up per run via Math.ceil, which systematically
  // over-predicts by a roughly uniform factor across samples (verified against
  // a synthetic ground truth: consistently ~15-30% high, not scattered). One
  // correction pass against the real discrete estimator removes most of that
  // bias without needing to model the rounding directly.
  const scaleCorrection = (() => {
    const placeholder: AnthropicCalibration = {
      model: "",
      ratios,
      sampleCount: 0,
      measuredAt: "",
      meanAbsPercentError: 0,
    };
    let totalPredicted = 0;
    let totalActual = 0;
    for (const sample of samples) {
      totalPredicted += buildEstimateView(sample.text, placeholder).count;
      totalActual += sample.actualTokens;
    }
    return totalActual > 0 ? totalPredicted / totalActual : 1;
  })();
  for (const cls of TOKEN_CLASSES) ratios[cls] *= scaleCorrection;

  const placeholder: AnthropicCalibration = {
    model: "",
    ratios,
    sampleCount: 0,
    measuredAt: "",
    meanAbsPercentError: 0,
  };
  let totalAbsPercentError = 0;
  for (const sample of samples) {
    const predicted = buildEstimateView(sample.text, placeholder).count;
    totalAbsPercentError += Math.abs(predicted - sample.actualTokens) / sample.actualTokens;
  }
  const meanAbsPercentError = (totalAbsPercentError / samples.length) * 100;

  return { ratios, meanAbsPercentError };
}

async function countTokensViaApi(text: string, model: string, apiKey: string): Promise<number> {
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: text }] }),
  });
  if (!res.ok) {
    throw new Error(`anthropic count_tokens request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { input_tokens: number };
  return data.input_tokens;
}

interface CalibrateInitOptions {
  path?: string;
  force: boolean;
}

function parseCalibrateInitArgs(argv: string[]): CalibrateInitOptions {
  let path: string | undefined;
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    path = arg;
  }
  return { path, force };
}

export async function runCalibrateInit(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parseCalibrateInitArgs(argv);
    const path = options.path ?? join(cwd, ".tokensift", "anthropic-fixtures.json");
    if (existsSync(path) && !options.force) {
      throw new Error(`${path} already exists; pass --force to overwrite`);
    }

    const template: FixturesFile = {
      _readme:
        "Replace these samples with 20+ real prompts or code snippets representative of what you send to Claude. Run `tokensift calibrate anthropic run --model <id>` once you have enough real samples.",
      samples: Array.from({ length: MIN_SAMPLES }, () => ({
        text: `${PLACEHOLDER_MARKER}: paste a real prompt or code snippet here`,
      })),
    };

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`);

    return { exitCode: 0, output: `wrote a calibration fixture template to ${path}` };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}

interface CalibrateRunOptions {
  fixtures?: string;
  model?: string;
  apiKeyEnv: string;
  out?: string;
}

function parseCalibrateRunArgs(argv: string[]): CalibrateRunOptions {
  let fixtures: string | undefined;
  let model: string | undefined;
  let apiKeyEnv = "ANTHROPIC_API_KEY";
  let out: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--fixtures":
        fixtures = requireValue(argv, ++i, "--fixtures");
        continue;
      case "--model":
        model = requireValue(argv, ++i, "--model");
        continue;
      case "--api-key-env":
        apiKeyEnv = requireValue(argv, ++i, "--api-key-env");
        continue;
      case "--out":
        out = requireValue(argv, ++i, "--out");
        continue;
      default:
        throw new Error(`unknown flag '${arg}'`);
    }
  }

  return { fixtures, model, apiKeyEnv, out };
}

export async function runCalibrateRun(argv: string[], cwd: string): Promise<RunResult> {
  try {
    const options = parseCalibrateRunArgs(argv);
    if (!options.model) {
      throw new Error("--model is required, calibration is per exact model id");
    }

    const fixturesPath = options.fixtures ?? join(cwd, ".tokensift", "anthropic-fixtures.json");
    if (!existsSync(fixturesPath)) {
      throw new Error(
        `fixtures file not found: ${fixturesPath}; run \`tokensift calibrate anthropic init\` first`,
      );
    }
    const parsed = JSON.parse(readFileSync(fixturesPath, "utf8")) as FixturesFile;
    const realSamples = (parsed.samples ?? []).filter(
      (s) => s.text && !s.text.includes(PLACEHOLDER_MARKER),
    );
    if (realSamples.length < MIN_SAMPLES) {
      throw new Error(
        `need at least ${MIN_SAMPLES} real samples in ${fixturesPath}, found ${realSamples.length}`,
      );
    }

    const apiKey = process.env[options.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`environment variable ${options.apiKeyEnv} is not set`);
    }

    const measured: MeasuredSample[] = [];
    for (const sample of realSamples) {
      const actualTokens = await countTokensViaApi(sample.text, options.model, apiKey);
      measured.push({ text: sample.text, actualTokens });
    }

    const { ratios, meanAbsPercentError } = fitRatios(measured);
    const record: AnthropicCalibration = {
      model: options.model,
      ratios,
      sampleCount: measured.length,
      measuredAt: new Date().toISOString(),
      meanAbsPercentError,
    };

    const outPath = options.out ?? join(cwd, ".tokensift", "anthropic-calibration.json");
    const existing = existsSync(outPath)
      ? (JSON.parse(readFileSync(outPath, "utf8")) as Record<string, AnthropicCalibration>)
      : {};
    existing[options.model] = record;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(existing, null, 2)}\n`);

    return {
      exitCode: 0,
      output: `calibrated ${options.model} from ${measured.length} samples, mean abs error ${meanAbsPercentError.toFixed(1)}%, wrote ${outPath}`,
    };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}
