import type { Encoder } from "./encoder.js";
import type { RepeatedSubstringIndex } from "./services/repeated-substring.js";
import type { InputRef, JsonRegion, Message, Slot, TokenView } from "./types.js";

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
