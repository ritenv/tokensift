import type { Severity } from "../types.js";
import { formatUsd } from "./format-usd.js";
import { lineOf } from "./line-of.js";
import type { FileResult } from "./reporter-json.js";

const COMMAND: Record<Severity, string> = { error: "error", warn: "warning", info: "notice" };

// GitHub workflow commands have two different escaping rules: the message body
// only needs %/CR/LF escaped, but property values (file=, title=) also need
// ":" and "," escaped since those are the command's own delimiters.
// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions
function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function formatGithub(results: FileResult[]): string {
  const lines: string[] = [];

  for (const { file, report, text } of results) {
    for (const finding of report.findings) {
      const props = [`file=${escapeProperty(file)}`, `title=${escapeProperty(finding.ruleId)}`];
      if (text !== undefined) {
        const line = lineOf(text, finding.loc.range[0]);
        props.push(`line=${line}`, `endLine=${line}`);
      }
      const cost = finding.cost
        ? ` (${formatUsd(finding.cost.per1000Calls.amount)} / 1K calls)`
        : "";
      lines.push(
        `::${COMMAND[finding.severity]} ${props.join(",")}::${escapeData(finding.message + cost)}`,
      );
    }
  }

  return lines.join("\n");
}
