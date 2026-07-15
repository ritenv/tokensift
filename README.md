# tokensift

Token-efficiency linter for LLM prompts and payloads.

Deterministic, local, tokenizer-level static analysis of prompt strings, `Message[]` arrays, and tool schemas.

**Status**: early scaffold. The core engine works: encoder abstraction, rule framework, shared services (JSON region parsing, repeated-substring detection), template slots, and one real rule (`uuid-bloat`). Most of the rule catalog, the CLI, and the reporters don't exist yet. See [DESIGN.md](./DESIGN.md) for tradeoffs made along the way.

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
- One rule: `uuid-bloat`.
- `t` / `dyn` for template-aware analysis.

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
