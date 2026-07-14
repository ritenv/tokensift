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
