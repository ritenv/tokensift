import type { Report } from "../analyze.js";

export interface FileResult {
  file: string;
  report: Report;
  /** raw analyzed text, only set for plain-string inputs; powers line numbers in the github reporter */
  text?: string;
}

const SCHEMA_VERSION = 1;

export function formatJson(results: FileResult[]): string {
  return JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      results: results.map(({ file, report }) => ({
        file,
        summary: report.summary,
        findings: report.findings,
        byRule: report.byRule,
      })),
    },
    null,
    2,
  );
}
