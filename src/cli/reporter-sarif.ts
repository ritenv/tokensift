import type { Finding, Severity } from "../types.js";
import { lineOf } from "./line-of.js";
import type { FileResult } from "./reporter-json.js";

const LEVEL: Record<Severity, string> = { error: "error", warn: "warning", info: "note" };

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
}

function collectRules(results: FileResult[]): SarifRule[] {
  const byId = new Map<string, SarifRule>();
  for (const { report } of results) {
    for (const finding of report.findings) {
      if (byId.has(finding.ruleId)) continue;
      byId.set(finding.ruleId, {
        id: finding.ruleId,
        shortDescription: { text: finding.ruleId },
        fullDescription: { text: finding.why },
      });
    }
  }
  return [...byId.values()];
}

function toSarifResult(file: string, finding: Finding, text: string | undefined) {
  const region = text !== undefined ? { startLine: lineOf(text, finding.loc.range[0]) } : undefined;
  return {
    ruleId: finding.ruleId,
    level: LEVEL[finding.severity],
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: file },
          ...(region ? { region } : {}),
        },
      },
    ],
  };
}

// SARIF 2.1.0, the format GitHub Code Scanning (and other SARIF consumers)
// expect. Pure serialization of the same Report data the other reporters use,
// nothing rule-specific here beyond mapping severity to SARIF's level enum.
// https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning
export function formatSarif(results: FileResult[]): string {
  const log = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "tokensift",
            informationUri: "https://github.com/ritenv/tokensift",
            rules: collectRules(results),
          },
        },
        results: results.flatMap(({ file, report, text }) =>
          report.findings.map((finding) => toSarifResult(file, finding, text)),
        ),
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}
