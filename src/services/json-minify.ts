// Strips insignificant JSON whitespace lexically, without ever calling JSON.parse/stringify.
// Parsing and re-serializing loses information JSON's grammar doesn't require it to lose:
// duplicate keys collapse to the last value, integers beyond Number.MAX_SAFE_INTEGER round
// to a different number, "1.0" becomes "1". Minifying text directly avoids all of that --
// the result is byte-identical to the input except for whitespace outside string literals,
// so it can't change what the JSON means, only how many tokens it costs.
export function minifyJsonText(text: string): string {
  let result = "";
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      result += ch;
      if (ch === "\\" && i + 1 < text.length) {
        i++;
        result += text[i];
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") continue;
    result += ch;
  }

  return result;
}
