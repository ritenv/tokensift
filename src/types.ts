export type Severity = "error" | "warn" | "info";
export type Confidence = "exact" | "estimate";

export interface Money {
  amount: number;
  currency: "USD";
}

export type InputKind = "string" | "messages" | "payload";

export interface InputRef {
  kind: InputKind;
  path?: string;
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}

export type ContentPart = TextPart | { type: string; [key: string]: unknown };

export interface Message {
  role: Role;
  content: string | ContentPart[];
}

export interface ToolSchema {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface Payload {
  model?: string;
  system?: string;
  messages?: Message[];
  tools?: ToolSchema[];
}

export type AnalysisInput = string | Message[] | Payload;

export interface Fix {
  description: string;
  range: [number, number];
  replacement: string;
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  why: string;
  loc: { input: InputRef; range: [number, number]; messageIndex?: number };
  tokens: { current: number; afterFix: number; saved: number };
  cost?: { perCall: Money; atVolume?: Money };
  fix?: Fix;
  suggestion?: string;
  confidence: Confidence;
}
