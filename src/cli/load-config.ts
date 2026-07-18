import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";

const CONFIG_FILENAME = "tokensift.config.json";

export function loadConfig(cwd: string, explicitPath?: string): Partial<Config> | undefined {
  const path = explicitPath ?? join(cwd, CONFIG_FILENAME);

  if (explicitPath && !existsSync(explicitPath)) {
    throw new Error(`config file not found: ${explicitPath}`);
  }
  if (!explicitPath && !existsSync(path)) {
    return undefined;
  }

  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in config file ${path}: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`config file ${path} must contain a JSON object`);
  }

  return parsed as Partial<Config>;
}
