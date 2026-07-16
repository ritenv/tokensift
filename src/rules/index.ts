import { prettyJson } from "./pretty-json.js";
import { repeatedBlock } from "./repeated-block.js";
import { unicodePunct } from "./unicode-punct.js";
import { uuidBloat } from "./uuid-bloat.js";
import { whitespaceRun } from "./whitespace-run.js";

export const builtinRules = [uuidBloat, unicodePunct, whitespaceRun, prettyJson, repeatedBlock];

export { uuidBloat, unicodePunct, whitespaceRun, prettyJson, repeatedBlock };
