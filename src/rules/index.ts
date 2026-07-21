import { base64Blob } from "./base64-blob.js";
import { baselineRegression } from "./baseline-regression.js";
import { budgetExceeded } from "./budget-exceeded.js";
import { deadInstruction } from "./dead-instruction.js";
import { digitFragmentation } from "./digit-fragmentation.js";
import { duplicateMessageContent } from "./duplicate-message-content.js";
import { filler } from "./filler.js";
import { highEntropyString } from "./high-entropy-string.js";
import { longKeys } from "./long-keys.js";
import { prettyJson } from "./pretty-json.js";
import { redundantStructure } from "./redundant-structure.js";
import { repeatedBlock } from "./repeated-block.js";
import { rowJson } from "./row-json.js";
import { unicodePunct } from "./unicode-punct.js";
import { unlabeledDynamic } from "./unlabeled-dynamic.js";
import { uuidBloat } from "./uuid-bloat.js";
import { verboseSchemaValues } from "./verbose-schema-values.js";
import { whitespaceRun } from "./whitespace-run.js";

export const builtinRules = [
  uuidBloat,
  unicodePunct,
  whitespaceRun,
  prettyJson,
  repeatedBlock,
  base64Blob,
  highEntropyString,
  digitFragmentation,
  duplicateMessageContent,
  filler,
  rowJson,
  longKeys,
  redundantStructure,
  verboseSchemaValues,
  deadInstruction,
  unlabeledDynamic,
  budgetExceeded,
  baselineRegression,
];

export {
  uuidBloat,
  unicodePunct,
  whitespaceRun,
  prettyJson,
  repeatedBlock,
  base64Blob,
  highEntropyString,
  digitFragmentation,
  duplicateMessageContent,
  filler,
  rowJson,
  longKeys,
  redundantStructure,
  verboseSchemaValues,
  deadInstruction,
  unlabeledDynamic,
  budgetExceeded,
  baselineRegression,
};
