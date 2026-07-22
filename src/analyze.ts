import type { Encoder } from "./encoder.js";
import { resolveEncoder } from "./encoder.js";
import type { AnalysisContext, Rule } from "./rule.js";
import { findJsonRegions } from "./services/json-regions.js";
import { buildRepeatedSubstringIndex } from "./services/repeated-substring.js";
import type {
  AnalysisInput,
  ContentPart,
  Finding,
  InputRef,
  Message,
  Slot,
  TokenView,
} from "./types.js";

export interface TokenizeOptions {
  model: string;
}

export function tokenize(text: string, options: TokenizeOptions): TokenView {
  return resolveEncoder(options.model).tokenize(text);
}

export interface AnalyzeOptions {
  model: string;
  rules?: Rule[];
  /** whether rules that can autofix should attach a Finding.fix; defaults to true */
  autofix?: boolean;
  /** declared total token budget, used by the budget-exceeded rule */
  budget?: number;
  /** previously recorded token count, used by the baseline-regression rule */
  baseline?: number;
  /** bypasses resolveEncoder(model) with a specific Encoder instance, e.g. a locally-calibrated one */
  encoder?: Encoder;
}

export interface ApplyFixesOptions {
  ruleIds?: string[];
}

export interface Report {
  summary: {
    totalTokens: number;
    staticTokens: number;
    dynamicBudget: number;
    totalWasteTokens: number;
  };
  findings: Finding[];
  byRule: Record<string, Finding[]>;
  /** returns the input with autofixable findings applied; pure, never writes anything */
  applyFixes(options?: ApplyFixesOptions): string;
}

interface Normalized {
  text: string;
  inputRef: InputRef;
  messages?: Message[];
  slots: Slot[];
}

function messageText(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content.map(partText).join("");
}

function partText(part: ContentPart): string {
  return "text" in part && typeof part.text === "string" ? part.text : "";
}

function normalize(input: AnalysisInput): Normalized {
  if (typeof input === "string") {
    return { text: input, inputRef: { kind: "string" }, slots: [] };
  }
  if (Array.isArray(input)) {
    return {
      text: input.map(messageText).join("\n"),
      inputRef: { kind: "messages" },
      messages: input,
      slots: [],
    };
  }
  if ("text" in input && "slots" in input) {
    return { text: input.text, inputRef: { kind: "string" }, slots: input.slots };
  }
  const messages = input.messages ?? [];
  const text = [input.system, ...messages.map(messageText)].filter(Boolean).join("\n");
  return { text, inputRef: { kind: "payload" }, messages, slots: [] };
}

export function analyze(input: AnalysisInput, options: AnalyzeOptions): Report {
  const { text, inputRef, messages, slots } = normalize(input);
  const encoder = options.encoder ?? resolveEncoder(options.model);
  const tokenView = encoder.tokenize(text);

  const ctx: AnalysisContext = {
    text,
    inputRef,
    encoder,
    tokenView,
    jsonRegions: findJsonRegions(text),
    repeated: buildRepeatedSubstringIndex(tokenView.tokens),
    slots,
    messages,
    indentMap: text.split("\n").map((line) => line.length - line.trimStart().length),
    autofix: options.autofix ?? true,
    budget: options.budget,
    baseline: options.baseline,
  };

  const findings: Finding[] = [];
  const byRule: Record<string, Finding[]> = {};
  for (const rule of options.rules ?? []) {
    const found = rule.check(ctx, rule.defaultSeverity);
    findings.push(...found);
    byRule[rule.id] = found;
  }

  const dynamicBudget = slots.reduce(
    (sum, slot) => sum + encoder.countTokens(slot.sample ?? ""),
    0,
  );
  const totalWasteTokens = findings.reduce((sum, f) => sum + f.tokens.saved, 0);

  function applyFixes(options: ApplyFixesOptions = {}): string {
    const fixes = findings
      .filter((f) => f.fix && (!options.ruleIds || options.ruleIds.includes(f.ruleId)))
      .map((f) => f.fix!)
      .sort((a, b) => a.range[0] - b.range[0]);

    let result = "";
    let cursor = 0;
    for (const fix of fixes) {
      if (fix.range[0] < cursor) continue;
      result += text.slice(cursor, fix.range[0]) + fix.replacement;
      cursor = fix.range[1];
    }
    result += text.slice(cursor);
    return result;
  }

  return {
    summary: {
      totalTokens: tokenView.count,
      staticTokens: tokenView.count - dynamicBudget,
      dynamicBudget,
      totalWasteTokens,
    },
    findings,
    byRule,
    applyFixes,
  };
}
