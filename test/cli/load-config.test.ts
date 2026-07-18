import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/cli/load-config.js";

const configsDir = fileURLToPath(new URL("../fixtures/cli/configs", import.meta.url));
const emptyDir = fileURLToPath(new URL("../fixtures/cli/prompts", import.meta.url));

describe("loadConfig", () => {
  it("auto-discovers tokensift.config.json in cwd", () => {
    const config = loadConfig(configsDir);
    expect(config?.model).toBe("gpt-4o");
    expect(config?.rules).toEqual({ "uuid-bloat": "error" });
  });

  it("returns undefined when no config file is present", () => {
    expect(loadConfig(emptyDir)).toBeUndefined();
  });

  it("loads an explicit --config path regardless of filename", () => {
    const config = loadConfig(emptyDir, `${configsDir}/tokensift.config.json`);
    expect(config?.model).toBe("gpt-4o");
  });

  it("throws when an explicit --config path doesn't exist", () => {
    expect(() => loadConfig(emptyDir, `${configsDir}/missing.json`)).toThrow(/not found/);
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => loadConfig(emptyDir, `${configsDir}/invalid.json`)).toThrow(/invalid JSON/);
  });

  it("throws when the config file isn't a JSON object", () => {
    expect(() => loadConfig(emptyDir, `${configsDir}/not-an-object.json`)).toThrow(
      /must contain a JSON object/,
    );
  });
});
