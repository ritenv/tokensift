import type { RepeatedSpan, TokenSpan } from "../types.js";

// standard online suffix automaton (Blumer et al). len(state) = longest
// string ending there, link = next shorter equivalence class down.
//
// cnt starts at 1 for states made directly in extend() (real new ending
// position), 0 for clones. propagate() sums cnt up the link chain so
// parents inherit totals from children, that's the occurrence count.
// firstEnd rides the same pass, one position per state -- not the full
// occurrence list, that part comes next.

interface SamState {
  len: number;
  link: number;
  next: Map<string, number>;
  cnt: number;
  firstEnd: number;
}

export class SuffixAutomaton {
  states: SamState[] = [{ len: 0, link: -1, next: new Map(), cnt: 0, firstEnd: -1 }];
  private last = 0;

  extend(symbol: string, pos: number): void {
    const cur = this.states.length;
    this.states.push({
      len: this.states[this.last]!.len + 1,
      link: -1,
      next: new Map(),
      cnt: 1,
      firstEnd: pos,
    });

    let p = this.last;
    while (p !== -1 && !this.states[p]!.next.has(symbol)) {
      this.states[p]!.next.set(symbol, cur);
      p = this.states[p]!.link;
    }

    if (p === -1) {
      this.states[cur]!.link = 0;
    } else {
      const q = this.states[p]!.next.get(symbol)!;
      if (this.states[p]!.len + 1 === this.states[q]!.len) {
        this.states[cur]!.link = q;
      } else {
        const clone = this.states.length;
        this.states.push({
          len: this.states[p]!.len + 1,
          link: this.states[q]!.link,
          next: new Map(this.states[q]!.next),
          cnt: 0,
          firstEnd: this.states[q]!.firstEnd,
        });
        while (p !== -1 && this.states[p]!.next.get(symbol) === q) {
          this.states[p]!.next.set(symbol, clone);
          p = this.states[p]!.link;
        }
        this.states[q]!.link = clone;
        this.states[cur]!.link = clone;
      }
    }
    this.last = cur;
  }

  /** endpos counts and first-occurrence positions, propagated child -> parent. */
  propagate(): void {
    const order = this.states
      .map((_, i) => i)
      .slice(1)
      .sort((a, b) => this.states[b]!.len - this.states[a]!.len);
    for (const i of order) {
      const link = this.states[i]!.link;
      this.states[link]!.cnt += this.states[i]!.cnt;
      if (
        this.states[i]!.firstEnd < this.states[link]!.firstEnd ||
        this.states[link]!.firstEnd === -1
      ) {
        this.states[link]!.firstEnd = this.states[i]!.firstEnd;
      }
    }
  }
}

// The automaton knows how many times a string repeats but not where, so
// find() re-scans the token stream for the rest of the occurrences once it
// knows which states are worth reporting. Two states can have the same cnt
// without being the same repeat -- "you are" and "you are a" can both occur
// twice at shifted offsets -- so dedup happens on the actual set of
// occurrence start positions, not on cnt equality up the link tree like
// you'd do for plain distinct-substring counting. Longest span per start-set
// wins, shorter ones sharing that exact start-set are implied by it.
export interface RepeatedSubstringIndex {
  find(minTokens: number): RepeatedSpan[];
}

export function buildRepeatedSubstringIndex(tokens: TokenSpan[]): RepeatedSubstringIndex {
  const words = tokens.map((t) => t.text);
  const sam = new SuffixAutomaton();
  words.forEach((w, i) => sam.extend(w, i));
  sam.propagate();

  const charStart: number[] = [];
  let running = 0;
  for (const t of tokens) {
    charStart.push(running);
    running += t.text.length;
  }
  const textEnd = running;

  return {
    find(minTokens: number): RepeatedSpan[] {
      const byOccurrenceSignature = new Map<string, { len: number; starts: number[] }>();

      for (let i = 1; i < sam.states.length; i++) {
        const s = sam.states[i]!;
        if (s.cnt < 2 || s.len < minTokens) continue;

        const start = s.firstEnd - s.len + 1;
        const pattern = words.slice(start, s.firstEnd + 1);
        const starts: number[] = [];
        for (let j = 0; j + pattern.length <= words.length; j++) {
          if (pattern.every((w, k) => words[j + k] === w)) starts.push(j);
        }
        if (starts.length < 2) continue;

        const signature = starts.join(",");
        const existing = byOccurrenceSignature.get(signature);
        if (!existing || existing.len < s.len) {
          byOccurrenceSignature.set(signature, { len: s.len, starts });
        }
      }

      const spans: RepeatedSpan[] = [];
      for (const { len, starts } of byOccurrenceSignature.values()) {
        const occurrences: [number, number][] = starts.map((j) => {
          const from = charStart[j]!;
          const to = j + len < charStart.length ? charStart[j + len]! : textEnd;
          return [from, to];
        });
        spans.push({
          text: words.slice(starts[0]!, starts[0]! + len).join(""),
          occurrences,
          tokenCost: len * (starts.length - 1),
        });
      }
      spans.sort((a, b) => b.tokenCost - a.tokenCost);
      return spans;
    },
  };
}
