import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCalibrateInit, runCalibrateRun } from "../../src/cli/calibrate.js";
import { buildEstimateView } from "../../src/encoders/anthropic.js";
import type { TokenClass } from "../../src/types.js";

let scratchDir: string | undefined;
afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
  vi.unstubAllGlobals();
});

describe("calibrate anthropic init", () => {
  it("writes a template with a _readme and placeholder samples", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = join(scratchDir, "fixtures.json");

    const result = await runCalibrateInit([path], scratchDir);
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(path, "utf8"));
    expect(written._readme).toContain("Replace these samples");
    expect(written.samples.length).toBeGreaterThanOrEqual(20);
    expect(written.samples[0].text).toContain("REPLACE ME");
  });

  it("refuses to overwrite an existing file without --force", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = join(scratchDir, "fixtures.json");
    writeFileSync(path, "{}");

    const result = await runCalibrateInit([path], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("already exists");
  });

  it("--force overwrites an existing file", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = join(scratchDir, "fixtures.json");
    writeFileSync(path, "{}");

    const result = await runCalibrateInit([path, "--force"], scratchDir);
    expect(result.exitCode).toBe(0);
  });
});

const REAL_SAMPLES = [
  "Summarize the following support ticket in one sentence.",
  "You are a helpful assistant that classifies customer feedback into billing, technical, or account categories.",
  "function add(a, b) { return a + b; }",
  "const user = { id: 42, name: 'Ada Lovelace', roles: ['admin', 'editor'] };",
  "Please review the attached error log and identify the root cause of the timeout.",
  "SELECT id, name, created_at FROM users WHERE active = true ORDER BY created_at DESC;",
  "The quarterly report shows a 12% increase in revenue compared to last year.",
  "Explain the difference between a stack and a queue in plain English.",
  "trace_id: 550e8400-e29b-41d4-a716-446655440000, status: failed, retries: 3",
  "Translate the following paragraph from English to French, keeping the tone formal.",
  "import { useState, useEffect } from 'react';",
  "curl -X POST https://api.example.com/v1/orders -H 'Content-Type: application/json'",
  "What are the main tradeoffs between microservices and a monolithic architecture?",
  "Write a haiku about autumn leaves falling in a quiet forest.",
  "class Animal:\n    def __init__(self, name):\n        self.name = name",
  "The patient reported mild headaches and fatigue over the past two weeks.",
  "git commit -m 'fix: handle null pointer in payment processor'",
  "docker run -d -p 8080:80 --name web nginx:latest",
  "Given a list of integers, return the two numbers that sum to a target value.",
  "The meeting has been rescheduled to Thursday at 3pm in conference room B.",
  "error: connection refused at 127.0.0.1:5432, retrying in 5 seconds",
  "Compare and contrast REST and GraphQL for a public API.",
];

function writeFixtures(dir: string, samples: string[] = REAL_SAMPLES) {
  const path = join(dir, "fixtures.json");
  writeFileSync(path, JSON.stringify({ samples: samples.map((text) => ({ text })) }));
  return path;
}

describe("calibrate anthropic run", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: an "undefined" string assignment would stay truthy
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("refuses when the fixtures file doesn't exist", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const result = await runCalibrateRun(
      ["--fixtures", join(scratchDir, "missing.json"), "--model", "claude-test"],
      scratchDir,
    );
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("not found");
  });

  it("refuses fewer than 20 real samples", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = writeFixtures(scratchDir, REAL_SAMPLES.slice(0, 5));
    const result = await runCalibrateRun(
      ["--fixtures", path, "--model", "claude-test"],
      scratchDir,
    );
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("at least 20");
  });

  it("refuses when --model is missing", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = writeFixtures(scratchDir);
    const result = await runCalibrateRun(["--fixtures", path], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("--model is required");
  });

  it("refuses when the API key env var is unset", async () => {
    // biome-ignore lint/performance/noDelete: an "undefined" string assignment would stay truthy
    delete process.env.ANTHROPIC_API_KEY;
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = writeFixtures(scratchDir);
    const result = await runCalibrateRun(
      ["--fixtures", path, "--model", "claude-test"],
      scratchDir,
    );
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("ANTHROPIC_API_KEY");
  });

  it("never calls the network for anything other than the count_tokens endpoint", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = writeFixtures(scratchDir);
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages/count_tokens");
      return new Response(JSON.stringify({ input_tokens: 10 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await runCalibrateRun(["--fixtures", path, "--model", "claude-test"], scratchDir);
    expect(fetchMock).toHaveBeenCalledTimes(REAL_SAMPLES.length);
  });

  it("recovers close-to-true per-class ratios with low error, merging with existing entries", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = writeFixtures(scratchDir);
    const outPath = join(scratchDir, ".tokensift", "anthropic-calibration.json");

    // ground truth the mock "API" is generated from -- matches the estimator's own
    // per-run structure (ceil(runLength / ratio) per class run), so the fit can be
    // checked against something the estimator can actually represent exactly
    const trueRatios: Record<TokenClass, number> = {
      word: 4,
      punct: 1,
      whitespace: 8,
      "digit-fragment": 2.5,
      "hex-fragment": 1.5,
      other: 2,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const text = body.messages[0].content as string;
        const view = buildEstimateView(text, {
          model: "",
          ratios: trueRatios,
          sampleCount: 0,
          measuredAt: "",
          meanAbsPercentError: 0,
        });
        return new Response(JSON.stringify({ input_tokens: view.count }), { status: 200 });
      }),
    );

    const result = await runCalibrateRun(
      ["--fixtures", path, "--model", "claude-test", "--out", outPath],
      scratchDir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("claude-test");

    const written = JSON.parse(readFileSync(outPath, "utf8"));
    expect(written["claude-test"].sampleCount).toBe(REAL_SAMPLES.length);
    expect(written["claude-test"].meanAbsPercentError).toBeLessThan(15);
    for (const ratio of Object.values(written["claude-test"].ratios)) {
      expect(ratio as number).toBeGreaterThan(0);
    }
    // word and punct dominate the corpus after short-whitespace merging, so
    // their fit is the reliable one to check tightly. whitespace/hex-fragment
    // barely appear standalone (most whitespace merges into the next word),
    // so their ratios are noisier and not asserted precisely here.
    expect(written["claude-test"].ratios.word).toBeCloseTo(trueRatios.word, 0);
    expect(written["claude-test"].ratios.punct).toBeCloseTo(trueRatios.punct, 0);
  });

  it("keeps an existing model's calibration when calibrating a different model", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-calibrate-"));
    const path = writeFixtures(scratchDir);
    const outPath = join(scratchDir, "calibration.json");
    writeFileSync(
      outPath,
      JSON.stringify({
        "claude-other": {
          model: "claude-other",
          ratios: {
            word: 4,
            punct: 1,
            whitespace: 6,
            "digit-fragment": 2.5,
            "hex-fragment": 1.8,
            other: 2,
          },
          sampleCount: 20,
          measuredAt: "2026-01-01T00:00:00.000Z",
          meanAbsPercentError: 3,
        },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ input_tokens: 10 }), { status: 200 })),
    );

    await runCalibrateRun(
      ["--fixtures", path, "--model", "claude-test", "--out", outPath],
      scratchDir,
    );

    const written = JSON.parse(readFileSync(outPath, "utf8"));
    expect(written["claude-other"]).toBeDefined();
    expect(written["claude-test"]).toBeDefined();
  });
});
