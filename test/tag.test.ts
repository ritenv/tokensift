import { describe, expect, it } from "vitest";
import { dyn, t } from "../src/tag.js";

describe("t / dyn", () => {
  it("interpolates plain values like a normal template literal", () => {
    const name = "Acme";
    const prompt = t`You are a support agent for ${name}.`;
    expect(prompt.text).toBe("You are a support agent for Acme.");
    expect(prompt.slots).toEqual([]);
  });

  it("substitutes a dyn() slot's value and records its range", () => {
    const prompt = t`Ticket: ${dyn("ticketBody", { value: "My billing failed twice" })}`;
    expect(prompt.text).toBe("Ticket: My billing failed twice");

    expect(prompt.slots).toHaveLength(1);
    const slot = prompt.slots[0]!;
    expect(slot.name).toBe("ticketBody");
    const [from, to] = slot.range;
    expect(prompt.text.slice(from, to)).toBe("My billing failed twice");
  });

  it("falls back to a placeholder when no value is given", () => {
    const prompt = t`Context: ${dyn("history")}`;
    expect(prompt.text).toBe("Context: <history>");
  });

  it("handles multiple slots in one template", () => {
    const prompt = t`${dyn("a", { value: "AAA" })} and ${dyn("b", { value: "BBB" })}`;
    expect(prompt.text).toBe("AAA and BBB");
    expect(prompt.slots.map((s) => s.name)).toEqual(["a", "b"]);
  });

  it("carries maxTokens through onto the slot", () => {
    const prompt = t`${dyn("ticketBody", { value: "hi", maxTokens: 800 })}`;
    expect(prompt.slots[0]?.maxTokens).toBe(800);
  });

  it("the same prompt-building function works for offline analysis and a real request", () => {
    const buildTicketPrompt = (ticketBody: string) =>
      t`You are a support agent.\nTicket: ${dyn("ticketBody", { value: ticketBody })}`;

    // offline / CI, no real data yet: a representative value
    const forAnalysis = buildTicketPrompt("my billing failed twice");
    expect(forAnalysis.text).toContain("my billing failed twice");

    // real request, real data: the exact same function, .text is the real prompt
    const forRequest = buildTicketPrompt("the app crashes on login for me specifically");
    expect(forRequest.text).toContain("the app crashes on login for me specifically");
    expect(forRequest.text).not.toContain("<ticketBody>");
  });
});
