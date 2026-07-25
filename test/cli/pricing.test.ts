import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPricingShow, runPricingUpdate } from "../../src/cli/pricing-cli.js";

let scratchDir: string | undefined;
afterEach(() => {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = undefined;
  vi.unstubAllGlobals();
});

describe("pricing show", () => {
  it("prints bundled pricing for a known model", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    const result = await runPricingShow(["gpt-4o"], scratchDir);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("gpt-4o (openai, bundled)");
    expect(result.output).toContain("input:");
  });

  it("refuses when no model is given", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    const result = await runPricingShow([], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("usage:");
  });

  it("errors clearly for a model with no pricing data at all", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    const result = await runPricingShow(["not-a-real-model"], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("no pricing data");
  });

  it("prefers a local override file over the bundled default", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    const dir = join(scratchDir, ".tokensift");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "pricing-overrides.json"),
      JSON.stringify({ "gpt-4o": { inputPerMTok: 1 } }),
    );

    const result = await runPricingShow(["gpt-4o"], scratchDir);
    expect(result.output).toContain("local override");
    expect(result.output).toContain("$1.0000 / 1M tokens");
  });
});

describe("pricing update", () => {
  it("fetches LiteLLM pricing and writes a local override file", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const body: Record<string, unknown> = {};
        for (const model of [
          "gpt-4o",
          "gpt-4o-mini",
          "gpt-4.1",
          "gpt-4-turbo",
          "gpt-4",
          "gpt-3.5-turbo",
          "claude-opus-4-5",
          "claude-sonnet-4-5",
          "claude-haiku-4-5",
        ]) {
          body[model] = {
            input_cost_per_token: 0.000002,
            output_cost_per_token: 0.000008,
            cache_read_input_token_cost: 0.0000005,
          };
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const outPath = join(scratchDir, "pricing.json");
    const result = await runPricingUpdate(["--out", outPath], scratchDir);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("refreshed pricing for 9 models");

    const written = JSON.parse(readFileSync(outPath, "utf8"));
    expect(written["gpt-4o"].inputPerMTok).toBeCloseTo(2);
    expect(written["gpt-4o"].outputPerMTok).toBeCloseTo(8);
    expect(written["gpt-4o"].cacheReadPerMTok).toBeCloseTo(0.5);
  });

  it("errors clearly when LiteLLM's response is missing a supported model", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    const result = await runPricingUpdate([], scratchDir);
    expect(result.exitCode).toBe(3);
    expect(result.output).toContain("missing for");
  });

  it("merges into an existing override file instead of clobbering it", async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "tokensift-pricing-"));
    const outPath = join(scratchDir, "pricing.json");
    writeFileSync(outPath, JSON.stringify({ "custom-model": { inputPerMTok: 42 } }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const body: Record<string, unknown> = {};
        for (const model of [
          "gpt-4o",
          "gpt-4o-mini",
          "gpt-4.1",
          "gpt-4-turbo",
          "gpt-4",
          "gpt-3.5-turbo",
          "claude-opus-4-5",
          "claude-sonnet-4-5",
          "claude-haiku-4-5",
        ]) {
          body[model] = { input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 };
        }
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    await runPricingUpdate(["--out", outPath], scratchDir);
    const written = JSON.parse(readFileSync(outPath, "utf8"));
    expect(written["custom-model"]).toEqual({ inputPerMTok: 42 });
    expect(written["gpt-4o"]).toBeDefined();
  });
});
