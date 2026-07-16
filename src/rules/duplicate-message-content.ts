import { defineRule } from "../rule.js";
import type { ContentPart, Finding, Message } from "../types.js";

const MIN_LEN = 20;

const WHY =
  "identical content repeated across messages, often a template-assembly bug (system prompt copy-pasted into a user turn), is paid every time it appears";

function contentText(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content.map(partText).join("");
}

function partText(part: ContentPart): string {
  return "text" in part && typeof part.text === "string" ? part.text : "";
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export const duplicateMessageContent = defineRule({
  id: "duplicate-message-content",
  defaultSeverity: "warn",
  why: WHY,
  check(ctx, severity) {
    const findings: Finding[] = [];
    const messages = ctx.messages ?? [];
    if (messages.length < 2) return findings;

    const seen = new Map<string, number>();
    let cursor = 0;

    for (let i = 0; i < messages.length; i++) {
      const content = contentText(messages[i]!);
      const offset = ctx.text.indexOf(content, cursor);
      if (offset !== -1) cursor = offset + content.length;

      if (content.length < MIN_LEN || offset === -1) continue;

      const signature = normalize(content);
      const firstIndex = seen.get(signature);
      if (firstIndex === undefined) {
        seen.set(signature, i);
        continue;
      }

      const current = ctx.encoder.countTokens(content);
      findings.push({
        ruleId: "duplicate-message-content",
        severity,
        message: `message ${i} (${messages[i]!.role}) repeats the content of message ${firstIndex} (${messages[firstIndex]!.role}), costing ${current} extra tokens`,
        why: WHY,
        loc: { input: ctx.inputRef, range: [offset, offset + content.length], messageIndex: i },
        tokens: { current, afterFix: 0, saved: current },
        suggestion: "say it once and let the model refer back to the earlier message",
        confidence: ctx.encoder.mode,
      });
    }

    return findings;
  },
});
