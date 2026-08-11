// whitespace inside these is semantically significant (preformatted text,
// script/style source) and must survive untouched, same reasoning as
// whitespace-run's code-fence guard.
const PRESERVE_WHITESPACE_TAGS = /<(pre|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;
// printable, not a control character (biome disallows those), distinctive
// enough that real prompt content won't collide with it
const PLACEHOLDER = (i: number) => ` @@HTML_PRESERVE_${i}@@ `;
const PLACEHOLDER_RE = / @@HTML_PRESERVE_(\d+)@@ /g;

// collapses whitespace the same way a browser already collapses it for
// rendering outside pre/script/style/textarea (runs of whitespace, including
// a newline plus indentation between tags, become a single space), so this
// never changes what a reader (or a model) sees, only how many tokens it costs.
export function minifyHtmlWhitespace(text: string): string {
  const preserved: string[] = [];
  const protectedText = text.replace(PRESERVE_WHITESPACE_TAGS, (match) => {
    preserved.push(match);
    return PLACEHOLDER(preserved.length - 1);
  });

  // collapse to a single space, never to nothing: `<b>bold</b> <i>italic</i>`
  // has a real, meaningful space between the two elements, deleting it
  // outright would merge "bold" and "italic" together with no separation.
  const collapsed = protectedText.replace(/>\s+</g, "> <").replace(/\s+/g, " ").trim();

  return collapsed.replace(PLACEHOLDER_RE, (_, i) => preserved[Number(i)] as string);
}
