import type { Encoder } from "./encoder.js";
import type { RepeatedSubstringIndex } from "./services/repeated-substring.js";
import type { Finding, InputRef, JsonRegion, Message, Severity, Slot, TokenView } from "./types.js";

export interface AnalysisContext {
  text: string;
  inputRef: InputRef;
  encoder: Encoder;
  tokenView: TokenView;
  jsonRegions: JsonRegion[];
  repeated: RepeatedSubstringIndex;
  slots: Slot[];
  messages?: Message[];
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
