# tokensift

Token-efficiency linter for LLM prompts and payloads.

Deterministic, local, tokenizer-level static analysis of prompt strings, `Message[]` arrays, and tool schemas.

**Status**: early scaffold. The core engine works: encoder abstraction, rule framework, shared services (JSON region parsing, repeated-substring detection), template slots, and ten rules. Most of the rule catalog, the CLI, and the reporters don't exist yet. See [DESIGN.md](./DESIGN.md) for tradeoffs made along the way.

## Install

```
pnpm add tokensift
```

## Usage

An incident triage prompt that asks the model to repeat a trace id back so an
engineer can find it in the logs. The model never has to parse the UUID,
just echo it, so a short id works just as well:

```ts
import { analyze, uuidBloat } from "tokensift";

const prompt = `You are an incident triage assistant. Summarize the error below for the
on-call engineer, and repeat the trace id so they can search the logs.

trace_id: 550e8400-e29b-41d4-a716-446655440000
error: payment gateway timeout after 30s, 3 consecutive failures`;

const report = analyze(prompt, { model: "gpt-4o", rules: [uuidBloat] });
console.log(report.findings[0]);
```

```js
{
  ruleId: 'uuid-bloat',
  severity: 'warn',
  message: "UUID '550e8400-e29b-41d4-a716-446655440000' costs 18 tokens (2.0 chars/token)",
  why: 'hex-with-dashes has no merges in BPE vocabularies, so UUIDs tokenize close to 1 token per 1-2 characters',
  tokens: { current: 18, afterFix: 3, saved: 15 },
  suggestion: "map '550e8400-e29b-41d4-a716-446655440000' to a short id like 'id-1' before prompting, and restore it in your own code after the response",
  confidence: 'exact',
  ...
}
```

18 of the prompt's 70 tokens are that one trace id. Swap it for `id-1` before
the call, and swap the model's `id-1` back to the real UUID in your own code
before showing the summary to the engineer. The engineer still gets the real
id; the model just never had to spend 18 tokens tokenizing it.

### Running everything at once

`builtinRules` runs every shipped rule together. Here's a support-ticket classifier prompt with two few-shot examples and an output schema, the kind of thing that grows by copy-paste:

```ts
import { analyze, builtinRules } from "tokensift";

const prompt = `You are a support ticket classifier. Classify each ticket into one of: billing, technical, account.

Example 1:
Ticket: "I was charged twice this month"
Classification: billing
Remember to respond with only the category name, nothing else.

Example 2:
Ticket: "I can't reset my password"
Classification: account
Remember to respond with only the category name, nothing else.

Output using this schema:
{
  "category": "string",
  "confidence": "number"
}`;

const report = analyze(prompt, { model: "gpt-4o", rules: builtinRules });
```

That's 101 tokens total, and two rules both fire: `repeated-block` catches the reminder line pasted after each example (26 tokens for something said once would cost 13), and `pretty-json` catches the indented schema (16 tokens vs 9 minified).

### Template slots

Real prompts have dynamic regions. Mark them with `dyn()` so analysis doesn't mis-tokenize a placeholder, and so static cost can be split from dynamic budget:

```ts
import { t, dyn, analyze } from "tokensift";

const prompt = t`You are a support agent.
Ticket: ${dyn("ticketBody", { sample: "my billing failed twice" })}`;

const report = analyze(prompt, { model: "gpt-4o" });
report.summary.staticTokens;
report.summary.dynamicBudget;
```

## What's here

- Exact token counts for OpenAI models (o200k_base, cl100k_base).
- `analyze()`, `tokenize()`, `createLinter()`, `defineConfig()`.
- Ten rules, see the table below.
- `t` / `dyn` for template-aware analysis.

## Rules

| Rule | Severity | Why | Suggestion |
| --- | --- | --- | --- |
| `uuid-bloat` | warn | UUIDs have no BPE merges, so they cost close to 1 token per 1-2 characters | map to a short id before prompting, restore it after |
| `unicode-punct` | info | smart quotes, em-dashes, NBSP, zero-width chars often cost more than their ASCII equivalents and slip in via copy-paste | normalize to the ASCII equivalent (autofix) |
| `whitespace-run` | warn | long runs of spaces or blank lines are real tokens once past the tokenizer's merge boundary | collapse the run (autofix) |
| `pretty-json` | warn | indentation and newlines in pretty-printed JSON cost tokens the model doesn't need to parse the data | minify the JSON region (autofix) |
| `repeated-block` | warn | a verbatim span repeated across a prompt is paid every time it appears | state it once, refer back to it |
| `base64-blob` | error | base64 has no word structure for BPE, so it runs close to 1 token per 1.3-1.5 characters | use the provider's file/image API instead of inlining |
| `high-entropy-string` | info | random strings (keys, cache ids) fragment close to character-per-token | reference by a short id, or keep it out of the prompt if it's a credential |
| `digit-fragmentation` | info | a full ISO-8601 timestamp tokenizes far worse than the epoch seconds it represents | store and pass epoch seconds, format for display only |
| `duplicate-message-content` | warn | identical content repeated across messages is usually a template bug, paid every call | say it once, let the model refer back |
| `filler` | info | hedging phrases are token cost with no instruction content | state the request directly |

## What's not here yet

- Anthropic and Gemini encoders. They throw a clear error rather than a guessed count.
- The rest of the rule catalog.
- CLI, reporters, pricing data.
- `diff()` and `budget()` are stubs that throw.
- `tokensift/matchers`, `tokensift/mcp`, `tokensift/action`.

## Non-goals

No LLM-powered rewriting here, that's a different product with different trust properties. Analysis is deterministic and offline.

No runtime proxying, request interception or usage dashboards: that space is already covered elsewhere.

tokensift doesn't judge prompt quality. It says "this costs more tokens than an equivalent structure".

No telemetry, accounts or background network calls. The only network calls this will ever make are pricing refreshes and opt-in provider token-count verification, both explicit.

## License

MIT
