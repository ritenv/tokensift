import { describe, expect, it } from "vitest";
import { analyze } from "../../src/analyze.js";
import { base64Blob } from "../../src/rules/base64-blob.js";

const blob = Buffer.from("a".repeat(80)).toString("base64");

describe("base64-blob", () => {
  it("flags a standalone base64 blob pasted into a prompt", () => {
    const report = analyze(`here is the attachment:\n${blob}\nplease summarize it`, {
      model: "gpt-4o",
      rules: [base64Blob],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.severity).toBe("error");
  });

  it("flags a data URI and doesn't double-count its payload", () => {
    const report = analyze(`<img src="data:image/png;base64,${blob}">`, {
      model: "gpt-4o",
      rules: [base64Blob],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).toContain("chars");
  });

  it("does not flag a long hex hash, that's not base64", () => {
    const sha256ish = "a1b2c3d4e5f6".repeat(6);
    const report = analyze(`checksum: ${sha256ish}`, {
      model: "gpt-4o",
      rules: [base64Blob],
    });
    expect(report.findings).toEqual([]);
  });

  it("does not flag a short base64-ish token", () => {
    const report = analyze("session=QWxhZGRpbjpvcGVuc2VzYW1l", {
      model: "gpt-4o",
      rules: [base64Blob],
    });
    expect(report.findings).toEqual([]);
  });
});
