import { prettyJson } from "./pretty-json.js";
import { unicodePunct } from "./unicode-punct.js";
import { uuidBloat } from "./uuid-bloat.js";
import { whitespaceRun } from "./whitespace-run.js";

export const builtinRules = [uuidBloat, unicodePunct, whitespaceRun, prettyJson];

export { uuidBloat, unicodePunct, whitespaceRun, prettyJson };
