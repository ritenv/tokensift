import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type BaselineStore = Record<string, number>;

const DEFAULT_BASELINE_PATH = ".tokensift/baseline.json";

export function resolveBaselinePath(cwd: string, explicitPath?: string): string {
  return explicitPath ?? join(cwd, DEFAULT_BASELINE_PATH);
}

export function loadBaseline(path: string): BaselineStore {
  if (!existsSync(path)) return {};

  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as BaselineStore;
  } catch (err) {
    throw new Error(`invalid JSON in baseline file ${path}: ${(err as Error).message}`);
  }
}

export function writeBaseline(path: string, store: BaselineStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}
