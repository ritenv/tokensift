import { describe, expect, it } from "vitest";
import { buildRepeatedSubstringIndex } from "../src/services/repeated-substring.js";
import type { TokenSpan } from "../src/types.js";

function tokensOf(words: string[]): TokenSpan[] {
  return words.map((text, id) => ({ text, id, byteRange: [0, 0] }));
}

describe("buildRepeatedSubstringIndex", () => {
  it("reports the longest repeat, not every prefix of it", () => {
    // "you are a helpful assistant" repeats verbatim; the automaton also
    // sees "you", "you are", "you are a", etc. as technically-repeated
    // substrings (same count, shifted endpos) and must not report those too.
    const words = "you are a helpful assistant you are a helpful assistant".split(" ");
    const spans = buildRepeatedSubstringIndex(tokensOf(words)).find(2);

    expect(spans).toHaveLength(1);
    expect(spans[0]?.text).toBe("youareahelpfulassistant");
    expect(spans[0]?.occurrences).toHaveLength(2);
  });

  it("finds overlapping-period repeats like abcabcabc", () => {
    const words = "a b c a b c a b c".split(" ");
    const spans = buildRepeatedSubstringIndex(tokensOf(words)).find(1);

    // "ab" and "a" occur at the exact same three starting positions as "abc"
    // (0, 3, 6), so they're implied by it and correctly dropped; "abc" only
    // extends to "abcabc" at two of those three starts (0 and 3 — starting
    // the 6-gram at 6 runs past the end of the stream), so that's reported
    // as its own, shorter-occurrence span.
    const byText = new Map(spans.map((s) => [s.text, s]));
    expect(byText.get("abc")?.occurrences).toHaveLength(3);
    expect(byText.get("abcabc")?.occurrences).toHaveLength(2);
    expect(byText.has("ab")).toBe(false);
  });

  it("reports nothing below the occurrence or length threshold", () => {
    const words = "a b c d e".split(" ");
    expect(buildRepeatedSubstringIndex(tokensOf(words)).find(1)).toEqual([]);
  });

  it("keeps unrelated repeats separate", () => {
    const words = "foo bar baz qux foo bar baz qux zzz zzz".split(" ");
    const spans = buildRepeatedSubstringIndex(tokensOf(words)).find(1);
    const texts = spans.map((s) => s.text).sort();
    expect(texts).toEqual(["foobarbazqux", "zzz"]);
  });

  it("orders spans by total wasted tokens, not by occurrence count", () => {
    // "marker" repeats twice for 1 wasted token; "a b c d" repeats twice for
    // 4. The one-token repeat should not outrank the four-token one just
    // because both happen twice.
    const words = "marker x y w q marker a b c d a b c d".split(" ");
    const spans = buildRepeatedSubstringIndex(tokensOf(words)).find(1);
    expect(spans[0]?.text).toBe("abcd");
    expect(spans[0]?.tokenCost).toBe(4);
    expect(spans.find((s) => s.text === "marker")?.tokenCost).toBe(1);
  });

  it("computes character ranges that round-trip against the joined text", () => {
    // Leading-space tokens are how real BPE output looks mid-sentence; using
    // them here (rather than plain words split on " ") is what actually
    // exercises the char-offset math, since token lengths vary by one.
    const words = ["retry", " on", " failure.", "\n", "retry", " on", " failure."];
    const text = words.join("");
    const spans = buildRepeatedSubstringIndex(tokensOf(words)).find(2);

    expect(spans).toHaveLength(1);
    const [from, to] = spans[0]!.occurrences[0]!;
    expect(text.slice(from, to)).toBe("retry on failure.");
  });
});
