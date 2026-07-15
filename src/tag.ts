import type { Slot, TaggedPrompt } from "./types.js";

export interface DynOptions {
  sample?: string;
  maxTokens?: number;
}

interface DynMarker extends DynOptions {
  tokensiftDyn: true;
  name: string;
}

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

    const sample = value.sample ?? `<${value.name}>`;
    const start = text.length;
    text += sample;
    slots.push({
      name: value.name,
      range: [start, text.length],
      sample,
      maxTokens: value.maxTokens,
    });
  });

  return { text, slots };
}
