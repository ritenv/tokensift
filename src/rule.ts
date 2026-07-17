import type { Encoder } from "./encoder.js";
import type { RepeatedSubstringIndex } from "./services/repeated-substring.js";
import type { Finding, InputRef, JsonRegion, Message, Severity, Slot, TokenView } from "./types.js";

export interface ProviderProfile {
  messageOverheadTokens?: number;
  cacheMinTokens?: number;
}

export interface AnalysisContext {
  text: string;
  inputRef: InputRef;
  encoder: Encoder;
  tokenView: TokenView;
  jsonRegions: JsonRegion[];
  repeated: RepeatedSubstringIndex;
  slots: Slot[];
  messages?: Message[];
  /** leading-whitespace char count per line, index-aligned with text.split("\n") */
  indentMap: number[];
  /** overheads/cache constants per provider; no curated data yet, always undefined for now */
  providerProfile?: ProviderProfile;
  /** whether rules that can autofix should attach a Finding.fix; defaults to true */
  autofix: boolean;
  /** declared total token budget for budget-exceeded; undefined means no budget configured */
  budget?: number;
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  why: string;
  check(ctx: AnalysisContext, severity: Severity): Finding[];
}

export function defineRule(rule: Rule): Rule {
  return rule;
}
