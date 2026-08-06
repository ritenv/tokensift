import type { Severity } from "../types.js";
import { formatUsd } from "./format-usd.js";
import type { FileResult } from "./reporter-json.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function formatMarkdown(results: FileResult[]): string {
  const lines: string[] = ["## tokensift", ""];

  const allFindings = results.flatMap((r) =>
    r.report.findings.map((f) => ({ file: r.file, finding: f })),
  );
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const { finding } of allFindings) counts[finding.severity]++;

  lines.push(
    `**${results.length} file(s), ${allFindings.length} finding(s)**: ` +
      `${counts.error} error, ${counts.warn} warn, ${counts.info} info`,
    "",
  );

  const totalWaste = allFindings.reduce((sum, { finding }) => sum + finding.tokens.saved, 0);
  const costs = results
    .map((r) => r.report.summary.cost?.per1000Calls.amount)
    .filter((amount): amount is number => amount !== undefined);
  const totalCost = costs.length > 0 ? costs.reduce((sum, a) => sum + a, 0) : undefined;
  const costSuffix = totalCost !== undefined ? ` (~${formatUsd(totalCost)} / 1K calls)` : "";
  lines.push(`Total addressable waste: ~${totalWaste} tokens${costSuffix}`, "");

  if (allFindings.length > 0) {
    lines.push(
      "| File | Rule | Severity | Message | Tokens saved |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const { file, finding } of allFindings) {
      lines.push(
        `| ${escapeCell(file)} | ${finding.ruleId} | ${finding.severity} | ` +
          `${escapeCell(finding.message)} | ${finding.tokens.saved} |`,
      );
    }
  }

  return lines.join("\n");
}
