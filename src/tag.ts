import type { Slot, TaggedPrompt } from "./types.js";

export interface DynOptions {
  /** the content that fills this slot: pass the real value at request time, or a representative one when analyzing offline without live data */
  value?: string;
  maxTokens?: number;
}

interface DynMarker extends DynOptions {
  tokensiftDyn: true;
  name: string;
}

// dyn() marks a region of a prompt as dynamic so analysis can split static
// cost from dynamic budget instead of mis-tokenizing a placeholder. It is not
// analysis-only: build the prompt with the same t`...${dyn(...)}` call at
// request time, passing the real value, and `.text` is the real prompt, no
// separate copy to keep in sync. Passing a representative value instead (no
// real data yet, or running offline in CI) is the same call, just used for
// measurement instead of sending.
export function dyn(name: string, options: DynOptions = {}): DynMarker {
  return { tokensiftDyn: true, name, ...options };
}

function isDynMarker(value: unknown): value is DynMarker {
  return typeof value === "object" && value !== null && (value as DynMarker).tokensiftDyn === true;
}

export function t(strings: TemplateStringsArray, ...values: unknown[]): TaggedPrompt {
  let text = "";
  const slots: Slot[] = [];

  strings.forEach((chunk, i) => {
    text += chunk;
    if (i >= values.length) return;

    const value = values[i];
    if (!isDynMarker(value)) {
      text += String(value);
      return;
    }

    const filled = value.value ?? `<${value.name}>`;
    const start = text.length;
    text += filled;
    slots.push({
      name: value.name,
      range: [start, text.length],
      value: filled,
      maxTokens: value.maxTokens,
    });
  });

  return { text, slots };
}
