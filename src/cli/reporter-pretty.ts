import type { Finding, Severity } from "../types.js";
import { formatUsd } from "./format-usd.js";
import type { FileResult } from "./reporter-json.js";

const SEVERITY_COLOR: Record<Severity, string> = {
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
};
const RESET = "\x1b[0m";

function colorize(text: string, code: string, color: boolean): string {
  return color ? `${code}${text}${RESET}` : text;
}

function formatFinding(finding: Finding, color: boolean): string {
  const label = colorize(finding.severity.padEnd(5), SEVERITY_COLOR[finding.severity], color);
  const cost = finding.cost ? ` (${formatUsd(finding.cost.per1000Calls.amount)} / 1K calls)` : "";
  return `  ${label} ${finding.ruleId}  ${finding.message}${cost}`;
}

export interface FormatPrettyOptions {
  color?: boolean;
}

export function formatPretty(results: FileResult[], options: FormatPrettyOptions = {}): string {
  const color = options.color ?? false;
  const lines: string[] = [];

  for (const { file, report } of results) {
    lines.push(file);
    if (report.findings.length === 0) {
      lines.push("  no findings");
    } else {
      for (const finding of report.findings) lines.push(formatFinding(finding, color));
    }
    lines.push("");
  }

  const allFindings = results.flatMap((r) => r.report.findings);
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of allFindings) counts[f.severity]++;

  const topSavings = [...allFindings]
    .sort((a, b) => b.tokens.saved - a.tokens.saved)
    .slice(0, 5)
    .filter((f) => f.tokens.saved > 0);

  const totalWaste = allFindings.reduce((sum, f) => sum + f.tokens.saved, 0);
  const costs = results
    .map((r) => r.report.summary.cost?.per1000Calls.amount)
    .filter((amount): amount is number => amount !== undefined);
  const totalCost = costs.length > 0 ? costs.reduce((sum, a) => sum + a, 0) : undefined;

  lines.push(
    `${results.length} file(s), ${allFindings.length} finding(s) ` +
      `(${counts.error} error, ${counts.warn} warn, ${counts.info} info)`,
  );

  if (topSavings.length > 0) {
    lines.push("top opportunities:");
    for (const f of topSavings) lines.push(`  ${f.ruleId} (${f.tokens.saved} tokens)`);
  }

  const costSuffix = totalCost !== undefined ? ` (~${formatUsd(totalCost)} / 1K calls)` : "";
  lines.push(`total addressable waste ~= ${totalWaste} tokens${costSuffix}`);

  return lines.join("\n");
}
