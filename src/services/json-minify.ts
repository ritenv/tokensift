// strips whitespace lexically instead of JSON.parse/stringify, which silently loses
// information the grammar doesn't require it to (duplicate keys, "1.0" becoming "1", large
// integers rounding) -- this stays byte-identical outside string literals
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
