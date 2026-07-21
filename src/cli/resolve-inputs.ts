import { readFileSync } from "node:fs";
import type { AnalysisInput } from "../types.js";
import { resolveGlob } from "./glob.js";

export interface ResolvedInput {
  file: string;
  input: AnalysisInput;
  writable: boolean;
}

export function resolveInputs(patterns: string[], cwd: string): ResolvedInput[] {
  const files = [...new Set(patterns.flatMap((pattern) => resolveGlob(pattern, cwd)))];
  if (files.length === 0) {
    throw new Error(`no files matched: ${patterns.join(", ")}`);
  }
  return files.map((file) => {
    const isJson = file.endsWith(".json");
    const raw = readFileSync(file, "utf8");
    return {
      file,
      input: isJson ? (JSON.parse(raw) as AnalysisInput) : raw,
      writable: !isJson,
    };
  });
}
