import { defineRule } from "../rule.js";
import { minifyHtmlWhitespace } from "../services/html-minify.js";
import type { Finding } from "../types.js";

const TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g;
const MIN_TAGS_IN_REGION = 3;
// how much non-tag content can sit between two tags before they count as two
// separate regions instead of one HTML block; wide enough for real markup
// with meaningful text between elements, narrow enough that two unrelated
// angle-bracket mentions elsewhere in a prompt don't get clustered together
const MAX_GAP_BETWEEN_TAGS = 200;

interface HtmlRegion {
  range: [number, number];
  text: string;
}

function findHtmlRegions(text: string): HtmlRegion[] {
  const tags = [...text.matchAll(TAG)];
  if (tags.length === 0) return [];

  const regions: HtmlRegion[] = [];
  let start = tags[0]!.index;
  let end = start + tags[0]![0].length;
  let count = 1;

  const flush = () => {
    if (count >= MIN_TAGS_IN_REGION) {
      regions.push({ range: [start, end], text: text.slice(start, end) });
    }
  };

  for (let i = 1; i < tags.length; i++) {
    const tag = tags[i]!;
    if (tag.index - end > MAX_GAP_BETWEEN_TAGS) {
      flush();
      start = tag.index;
      count = 0;
    }
    end = tag.index + tag[0].length;
    count++;
  }
  flush();

  return regions;
}

const WHY =
  "pretty-printed HTML spends a token on a newline and indentation before nearly every tag; the model doesn't need that structure to read the markup";

const SUGGESTION =
  "collapse HTML whitespace to single spaces (pre/script/style/textarea left untouched)";

export const htmlWhitespace = defineRule({
  id: "html-whitespace",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];

    for (const region of findHtmlRegions(ctx.text)) {
      const minified = minifyHtmlWhitespace(region.text);
      if (minified === region.text) continue;

      const current = ctx.encoder.countTokens(region.text);
      const afterFix = ctx.encoder.countTokens(minified);
      if (current <= afterFix) continue;

      const [start, end] = region.range;
      findings.push({
        ruleId: "html-whitespace",
        severity,
        message: `pretty-printed HTML costs ${current} tokens, whitespace-collapsed costs ${afterFix}`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [start, end] },
        tokens: { current, afterFix, saved: current - afterFix },
        fix: ctx.autofix
          ? { description: "collapse HTML whitespace", range: [start, end], replacement: minified }
          : undefined,
        suggestion: SUGGESTION,
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
