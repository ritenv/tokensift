import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { htmlWhitespace } from "../../src/rules/html-whitespace.js";

const prettyHtml = `<div class="product-card">
  <div class="product-image">
    <img src="/images/widget-42.jpg" alt="Widget 42" />
  </div>
  <div class="product-details">
    <h2 class="product-title">Widget 42</h2>
    <p class="product-description">
      A high quality widget for all your widget needs.
    </p>
    <span class="product-price">$29.99</span>
    <button class="add-to-cart" data-product-id="42">
      Add to Cart
    </button>
  </div>
</div>`;

describe("html-whitespace", () => {
  it("flags pretty-printed HTML embedded in a prompt", () => {
    const prompt = `summarize this:\n${prettyHtml}\nplease`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [htmlWhitespace] });

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0]!;
    expect(finding.tokens.current).toBeGreaterThan(finding.tokens.afterFix);
    expect(finding.fix?.replacement).not.toContain("\n");
  });

  it("does not flag HTML that's already on one line", () => {
    const prompt = `<div class="a"><span>hi</span></div>`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [htmlWhitespace] });
    expect(report.findings).toEqual([]);
  });

  it("requires at least a few tags before treating something as HTML", () => {
    const report = analyze("the price is <10 dollars, or maybe <5", {
      model: "gpt-4o",
      rules: [htmlWhitespace],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag TypeScript generics as HTML (no closing tags, no attributes)", () => {
    const prompt = `interface Config {
  names: Array<string>;
  ids: Array<number>;
  flags: Array<boolean>;
  tags: Array<string>;
}`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [htmlWhitespace] });
    expect(report.findings).toEqual([]);
  });

  it("still flags real HTML mixed with a couple of generic-shaped tags", () => {
    const prompt = `<div class="config">
  <span>Array<string> items</span>
  <span>Array<number> ids</span>
</div>`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [htmlWhitespace] });
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("finds nothing when there's no HTML in the prompt", () => {
    const report = analyze("summarize the ticket below in plain prose", {
      model: "gpt-4o",
      rules: [htmlWhitespace],
    });
    expect(report.findings).toEqual([]);
  });

  it("leaves pre/script/style content untouched in the fix", () => {
    const prompt = `<div>
  <pre>
    line one
    line two
  </pre>
  <span>caption</span>
</div>`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [htmlWhitespace] });
    expect(report.findings[0]?.fix?.replacement).toContain("    line one\n    line two");
  });

  it("does not touch a real single inline space between adjacent tags", () => {
    const prompt = `<div>
  <b>bold</b> <i>italic</i>
  <b>bold</b> <i>italic</i>
  <b>bold</b> <i>italic</i>
</div>`;
    const report = analyze(prompt, { model: "gpt-4o", rules: [htmlWhitespace] });
    expect(report.findings[0]?.fix?.replacement).toContain("<b>bold</b> <i>italic</i>");
  });
});
