import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type BudgetStore = Record<string, number>;

const DEFAULT_BUDGET_PATH = ".tokensift/budgets.json";

export function resolveBudgetPath(cwd: string, explicitPath?: string): string {
  return explicitPath ?? join(cwd, DEFAULT_BUDGET_PATH);
}

export function loadBudget(path: string): BudgetStore {
  if (!existsSync(path)) return {};

  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as BudgetStore;
  } catch (err) {
    throw new Error(`invalid JSON in budget file ${path}: ${(err as Error).message}`);
  }
}

export function writeBudget(path: string, store: BudgetStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}
