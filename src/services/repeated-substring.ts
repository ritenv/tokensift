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
