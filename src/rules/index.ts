import { base64Blob } from "./base64-blob.js";
import { digitFragmentation } from "./digit-fragmentation.js";
import { duplicateMessageContent } from "./duplicate-message-content.js";
import { filler } from "./filler.js";
import { highEntropyString } from "./high-entropy-string.js";
import { prettyJson } from "./pretty-json.js";
import { repeatedBlock } from "./repeated-block.js";
import { unicodePunct } from "./unicode-punct.js";
import { uuidBloat } from "./uuid-bloat.js";
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
};
