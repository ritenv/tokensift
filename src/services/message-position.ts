import type { Message } from "../types.js";

function messageText(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join("");
}

// same indexOf-with-advancing-cursor technique duplicate-message-content.ts uses to locate a
// message's own span inside ctx.text, reused here to attribute a text position back to the
// message it came from, without replicating normalize()'s exact join logic.
export function findMessageIndex(
  text: string,
  messages: Message[] | undefined,
  position: number,
): number | undefined {
  if (!messages) return undefined;
  let cursor = 0;
  for (let i = 0; i < messages.length; i++) {
    const content = messageText(messages[i]!);
    if (!content) continue;
    const offset = text.indexOf(content, cursor);
    if (offset === -1) continue;
    cursor = offset + content.length;
    if (position >= offset && position < cursor) return i;
  }
  return undefined;
}
