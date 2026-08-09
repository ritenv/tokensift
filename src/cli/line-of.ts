// shared between reporter-github.ts and reporter-sarif.ts, both need to turn
// a Finding.loc.range char offset into a 1-indexed line number for annotations.
export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}
