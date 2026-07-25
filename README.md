# tokensift

[![CI](https://img.shields.io/github/actions/workflow/status/ritenv/tokensift/ci.yml?branch=main)](https://github.com/ritenv/tokensift/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/tokensift)](https://www.npmjs.com/package/tokensift)
[![npm downloads](https://img.shields.io/npm/dm/tokensift)](https://www.npmjs.com/package/tokensift)
[![license](https://img.shields.io/npm/l/tokensift)](./LICENSE)

Token-efficiency linter for LLM prompts and payloads.

Deterministic, local, tokenizer-level static analysis of prompt strings, `Message[]` arrays, and tool schemas.

**Status**: early, actively developed. Core engine, 18 rules, real dollar cost per finding, a CLI (`analyze`/`check`/`budget init`/`calibrate`/`pricing`), and `tokensift/matchers` for vitest/jest all work today. OpenAI models are exact; Claude support is estimate-based, see [What's here](#whats-here) below. See [DESIGN.md](./DESIGN.md) for tradeoffs made along the way.

## Contents

- [What is this?](#what-is-this)
- [Install](#install)
- [Quickstart](#quickstart)
  - [Template slots](#template-slots)
- [CLI](#cli)
  - [Baseline regression](#baseline-regression)
  - [`check` and `budget init`](#check-and-budget-init)
  - [`calibrate`](#calibrate)
  - [Cost and pricing](#cost-and-pricing)
  - [Config file](#config-file)
- [Test matchers](#test-matchers)
- [Rules](#rules)
- [What's here](#whats-here)
- [What's not here yet](#whats-not-here-yet)
- [Non-goals](#non-goals)
- [License](#license)

## What is this?

LLM APIs charge per token, and token counts don't line up with characters or words as cleanly as you'd expect. A UUID, a base64-encoded file, an indented JSON blob: all of these cost more tokens than their length suggests, because the tokenizer can't find any reusable pattern in them. tokensift reads a prompt (or a whole message array, or a tool schema) and points out exactly where that's happening: this UUID cost 18 tokens and a short id would've cost 3, this block of instructions got pasted twice, this JSON would tokenize the same minified.

It does this by actually tokenizing the text with the encoder the provider uses, not by estimating from character count. For OpenAI models that means the real BPE vocabulary, so counts are exact. For Claude, where no public tokenizer exists, it uses a calibrated estimate and says so on every finding (`confidence: "estimate"` vs `"exact"`).

If code linters are a useful comparison: this is that, but for token cost instead of style. Same idea as ESLint flagging an unused variable, just aimed at a different kind of waste: text that costs money and context-window space without doing anything for the model.

Two ways to use it: as a library, called from your own code or test suite, or as a CLI, pointed at prompt files and wired into CI. Both run the same rules and produce the same findings.

## Install

```
pnpm add tokensift
```

## Quickstart

A support-ticket classifier prompt with two few-shot examples, a ticket id, and an output schema, the kind of thing that grows by copy-paste. `builtinRules` runs every shipped rule together:

```ts
import { analyze, builtinRules } from "tokensift";

const prompt = `You are a support ticket classifier. Classify each ticket into one of: billing, technical, account.
Remember to respond with only the category name, nothing else.

Example 1:
Ticket: "I was charged twice this month"
Classification: billing
Remember to respond with only the category name, nothing else.

Example 2:
Ticket: "I can't reset my password"
Classification: account
Remember to respond with only the category name, nothing else.

Ticket 550e8400-e29b-41d4-a716-446655440000, from a customer: "My account was charged twice and I need a refund"

Output using this schema:
{
  "category": "string",
  "confidence": "number"
}`;

const report = analyze(prompt, { model: "gpt-4o", rules: builtinRules });
console.log(report.findings);
```

Three rules catch three different problems in this prompt. Full output, unedited:

```js
[
  {
    ruleId: 'uuid-bloat',
    severity: 'warn',
    message: "UUID '550e8400-e29b-41d4-a716-446655440000' costs 18 tokens (2.0 chars/token)",
    why: 'hex-with-dashes has no merges in BPE vocabularies, so UUIDs tokenize close to 1 token per 1-2 characters',
    loc: { input: { kind: 'string' }, range: [445, 481] },
    tokens: { current: 18, afterFix: 3, saved: 15 },
    suggestion: "map '550e8400-e29b-41d4-a716-446655440000' to a short id like 'id-1' before prompting, and restore it in your own code after the response",
    confidence: 'exact',
    cost: { perCall: { amount: 0.0000375, currency: 'USD' }, per1000Calls: { amount: 0.0375, currency: 'USD' } }
  },
  {
    ruleId: 'pretty-json',
    severity: 'warn',
    message: 'pretty-printed JSON costs 16 tokens, minified costs 9',
    why: "indented JSON spends tokens on newlines and leading spaces at every nesting level; the model doesn't need pretty-printing to parse structured data",
    loc: { input: { kind: 'string' }, range: [578, 630] },
    tokens: { current: 16, afterFix: 9, saved: 7 },
    fix: {
      description: 'minify JSON region',
      range: [578, 630],
      replacement: '{"category":"string","confidence":"number"}'
    },
    suggestion: 'minify the JSON region',
    confidence: 'exact',
    cost: { perCall: { amount: 0.0000175, currency: 'USD' }, per1000Calls: { amount: 0.0175, currency: 'USD' } }
  },
  {
    ruleId: 'repeated-block',
    severity: 'warn',
    message: 'a 12-token span repeats 3 times, costing 36 tokens total',
    why: "verbatim spans repeated across a prompt (boilerplate headers, re-pasted examples) are paid every time they appear; the model doesn't need the repetition to use them",
    loc: { input: { kind: 'string' }, range: [100, 164] },
    tokens: { current: 36, afterFix: 12, saved: 24 },
    suggestion: 'state this block once and refer back to it instead of repasting it',
    confidence: 'exact',
    cost: { perCall: { amount: 0.00006, currency: 'USD' }, per1000Calls: { amount: 0.06, currency: 'USD' } }
  }
]
```

Same three findings, condensed:

```ts
report.findings.map((f) => `${f.ruleId}: ${f.message}`);
```
```js
[
  "uuid-bloat: UUID '550e8400-e29b-41d4-a716-446655440000' costs 18 tokens (2.0 chars/token)",
  "pretty-json: pretty-printed JSON costs 16 tokens, minified costs 9",
  "repeated-block: a 12-token span repeats 3 times, costing 36 tokens total"
]
```

150 tokens total, 46 of them wasted. `report.summary.cost`: $0.000115 per call, $0.115 per 1,000 calls, real money once this runs at any volume.

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

## CLI

Same engine, from a terminal. Point it at a file, a glob, or stdin:

```
echo "You are an incident triage assistant. Summarize the error below for the
on-call engineer, and repeat the trace id so they can search the logs.

trace_id: 550e8400-e29b-41d4-a716-446655440000
error: payment gateway timeout after 30s, 3 consecutive failures" | tokensift --stdin --model gpt-4o
```

```
<stdin>
  warn  uuid-bloat  UUID '550e8400-e29b-41d4-a716-446655440000' costs 18 tokens (2.0 chars/token) ($0.038 / 1K calls)

1 file(s), 1 finding(s) (0 error, 1 warn, 0 info)
top opportunities:
  uuid-bloat (15 tokens)
total addressable waste ~= 15 tokens (~$0.038 / 1K calls)
```

Or against real files: `tokensift prompts/*.md --model gpt-4o`. `**` works too (`tokensift "prompts/**/*.md" --model gpt-4o`), quote it so your shell doesn't expand it first.

`--format json` gives you the full `Report` per file instead, for piping into other tools:

```
tokensift ticket.md --model gpt-4o --format json
```
```js
{
  "schemaVersion": 1,
  "results": [
    {
      "file": "ticket.md",
      "summary": { "totalTokens": 23, "cost": { "perCall": { "amount": 0.0000375, "currency": "USD" }, "per1000Calls": { "amount": 0.0375, "currency": "USD" } }, ... },
      "findings": [ { "ruleId": "uuid-bloat", "tokens": { ... }, "cost": { "perCall": { "amount": 0.0000375, "currency": "USD" }, "per1000Calls": { "amount": 0.0375, "currency": "USD" } }, ... } ],
      "byRule": { ... }
    }
  ]
}
```

`--fix --write` applies the safe autofixes (`unicode-punct`, `whitespace-run`, `pretty-json`) and writes them back to the file. It refuses `.json` inputs outright rather than guessing at how to write them back safely, see [DESIGN.md](./DESIGN.md) for why.

Other flags: `--rules uuid-bloat=off,filler=error`, `--max-warnings n`, `--config <path>`. Exit codes: `0` clean, `1` warnings past `--max-warnings`, `2` any error-severity finding, `3` bad input, bad flags, or a bad config file.

### Baseline regression

Record how many tokens a file costs today, then get flagged when it drifts too far from that:

```
tokensift prompts/*.md --model gpt-4o --update-baseline
```

That writes `.tokensift/baseline.json` (one entry per file, keyed by path relative to where you ran the command). Commit it. Run `tokensift` again later without `--update-baseline` and `baseline-regression` fires if a file has grown more than 10% past its recorded count. Re-run with `--update-baseline` once the growth is intentional. `--baseline-file <path>` points at a different file instead of the `.tokensift/baseline.json` default.

### `check` and `budget init`

The CI entry point. `budget init` records a hard per-file token ceiling, `check` runs everything and fails on any error-severity finding, whether that's `budget-exceeded`, `baseline-regression`, or any other rule, `base64-blob` included:

```
tokensift budget init prompts/*.md --model gpt-4o
tokensift check prompts/*.md --model gpt-4o
```

`budget init` writes `.tokensift/budgets.json`, same shape and same `--budget-file` override as the baseline store. `check` reads both `.tokensift/budgets.json` and `.tokensift/baseline.json` automatically if they exist and applies them per file. Unlike `analyze`, `check` has no `--fix`, `--write`, or `--max-warnings`, it's meant to be the one deterministic gate CI runs: exit `0` or exit `2`, nothing in between. `--format json` works the same as it does on `analyze`.

### `calibrate`

There's a real Anthropic estimate encoder, with bundled calibration data for the current-generation models: `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5` (measured mean absolute error ~7.6%, against a 28-sample dedicated fixture corpus, real calls to Anthropic's token-counting endpoint). Any other `claude-*` id throws `no calibration data for '<model>'`, naming the `calibrate` command as the way to add one. Findings on a calibrated model carry `confidence: "estimate"`, same honesty rule as the rest of this package: there's no public BPE table to be exact against, only an estimate with a measured error, never presented as exact.

Run your own calibration against your own Anthropic key and your own prompts:

```
tokensift calibrate anthropic init
# edit .tokensift/anthropic-fixtures.json: replace the 20 placeholder samples
# with real prompts or code representative of what you actually send
tokensift calibrate anthropic run --model claude-sonnet-4-5
```

`init` refuses to overwrite an existing fixtures file unless you pass `--force`. `run` needs `ANTHROPIC_API_KEY` set (or `--api-key-env <name>` for a different variable) and at least 20 real samples, it calls Anthropic's token-counting endpoint once per sample and writes the fitted result to `.tokensift/anthropic-calibration.json` (`--out <path>` for somewhere else). This is the only network call anywhere in this package, and it only happens when you run this command, never during `analyze`/`check`. `analyze`/`check` pick up a local calibration file automatically for any model it has an entry for (`--calibration-file <path>` to point elsewhere), falling back to the bundled default otherwise.

### Cost and pricing

Every finding carries real dollar cost, not just a token count: `Finding.cost.perCall` is `tokens.saved` multiplied by the real price for the model you passed, sourced from a curated snapshot of [LiteLLM's pricing table](https://github.com/BerriAI/litellm) (MIT-licensed, see [LICENSE-THIRD-PARTY.md](./LICENSE-THIRD-PARTY.md)). `perCall` is usually a fraction of a cent, so `Finding.cost.per1000Calls` is the same number at a denomination that actually reads as a number, same idea as a vendor quoting "$X per 1K tokens" instead of a fractional-cent per-token rate; it's what the CLI's pretty output shows next to each finding. `report.summary.cost` is the same shape, summed across every finding, so you get one total for the whole file without adding it up yourself. Set a volume in your config file and every finding also gets `atVolume`, the projected monthly cost of leaving that waste in place:

```json
{
  "model": "gpt-4o",
  "volume": { "requestsPerDay": 25000 }
}
```

`tokensift pricing show <model>` prints the rates tokensift is actually using for a model:

```
tokensift pricing show gpt-4o
```
```
gpt-4o (openai, bundled)
  input:  $2.5000 / 1M tokens
  output: $10.0000 / 1M tokens
  cache read: $1.2500 / 1M tokens
```

`tokensift pricing update` refetches the LiteLLM snapshot and writes a local `.tokensift/pricing-overrides.json` (`--out <path>` for somewhere else), which `analyze`/`check` prefer over the bundled default per exact model id, same override pattern as `calibrate`. This is the only other network call anywhere in this package besides `calibrate anthropic run`, strictly opt-in, never automatic. You can also hand-write overrides for a specific model, or set `pricing.overrides` in your config file, in dollars per million tokens:

```json
{
  "model": "gpt-4o",
  "pricing": { "overrides": { "gpt-4o": { "inputPerMTok": 2.0 } } }
}
```

### Config file

Drop a `tokensift.config.json` next to where you run the command, and stop repeating `--model` on every call:

```json
{
  "model": "gpt-4o",
  "rules": { "filler": "off" }
}
```

CLI flags win when both are set. Only JSON is supported for now, no `.js`/`.ts` config loading yet.

## Test matchers

`tokensift/matchers` works with vitest or jest, since it doesn't import either, it just extends the global `expect` if one's already registered:

```ts
import "tokensift/matchers";

expect(prompt).toBeUnderTokens(2000, { model: "gpt-4o" });
expect(payload).toHaveNoTokensiftErrors({ model: "gpt-4o" });
expect(prompt).toMatchTokenBaseline({ model: "gpt-4o" });
```

That auto-registration needs a global `expect`, which jest has by default and vitest only has with `test.globals: true`. Without globals, extend it yourself:

```ts
import { expect } from "vitest";
import * as matchers from "tokensift/matchers";
expect.extend(matchers);
```

`toMatchTokenBaseline` records a token count the first time a test runs and compares against it on every run after, failing once growth passes 10%, same tolerance as the CLI's `baseline-regression` rule. It stores counts in `.tokensift/matcher-baselines.json`, keyed by test file and test name, commit that file alongside your tests. Pass `{ updateBaseline: true }` once growth is intentional.

## What's here

- Exact token counts for OpenAI models (o200k_base, cl100k_base).
- A real estimate encoder for Anthropic models, character-class-based, calibrated via `tokensift calibrate anthropic run` against Anthropic's own token-counting endpoint. Bundled calibration data ships for `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5` (~7.6% mean error); other `claude-*` ids throw until you calibrate them yourself.
- `analyze()`, `tokenize()`, `createLinter()`, `defineConfig()`.
- Eighteen rules, see the table below.
- A declared token budget (`budget-exceeded`), off by default until you set one.
- A recorded baseline (`baseline-regression`), off by default until you record one.
- `t` / `dyn` for template-aware analysis.
- Real dollar cost on every finding (`Finding.cost.perCall`, `per1000Calls`, plus `atVolume` when you set a request volume), sourced from a curated LiteLLM pricing snapshot, refreshable via `tokensift pricing update` and overridable per model.
- A `tokensift` CLI: `analyze`, `check`, `budget init`, `calibrate anthropic`, `pricing show`/`update` commands, `pretty`/`json` output, `--fix`/`--write`, glob and stdin input, JSON config file, baseline and budget stores.
- `tokensift/matchers`: `toBeUnderTokens`, `toHaveNoTokensiftErrors`, `toMatchTokenBaseline` for vitest/jest.

## Rules

| Rule | Severity | Autofix | Why | Suggestion |
| --- | --- | --- | --- | --- |
| `uuid-bloat` | warn | no | UUIDs have no BPE merges, so they cost close to 1 token per 1-2 characters | map to a short id before prompting, restore it after |
| `unicode-punct` | info | yes | smart quotes, em-dashes, NBSP, zero-width chars often cost more than their ASCII equivalents and slip in via copy-paste | normalize to the ASCII equivalent |
| `whitespace-run` | warn | yes | long runs of spaces or blank lines are real tokens once past the tokenizer's merge boundary | collapse the run |
| `pretty-json` | warn | yes | indentation and newlines in pretty-printed JSON cost tokens the model doesn't need to parse the data | minify the JSON region |
| `repeated-block` | warn | no | a verbatim span repeated across a prompt is paid every time it appears | state this block once and refer back to it instead of repasting it |
| `base64-blob` | error | no | base64 has no word structure for BPE, so it runs close to 1 token per 1.3-1.5 characters | pass the file through the provider's file/image API or a reference id instead of inlining it |
| `high-entropy-string` | info | no | random strings (keys, cache ids) fragment close to character-per-token | reference this value by a short id, or keep it out of the prompt entirely if it's a credential |
| `digit-fragmentation` | info | no | a full ISO-8601 timestamp tokenizes far worse than the epoch seconds it represents | store and pass epoch seconds; format as a human-readable date only where it's displayed |
| `duplicate-message-content` | warn | no | identical content repeated across messages is usually a template bug, paid every call | say it once and let the model refer back to the earlier message |
| `filler` | info | no | hedging phrases are token cost with no instruction content | state the request directly, drop the hedging |
| `row-json` | warn | no | row-oriented JSON repeats every key on every element, N rows means N times the key cost | restructure as columnar JSON or CSV if the model doesn't need per-row objects |
| `long-keys` | info | no | descriptive keys are re-paid on every row in bulk data | ship a short-key legend once, remap rows to it |
| `redundant-structure` | info | no | the same data serialized twice costs twice, even reformatted; repeated-block only catches byte-identical repeats | include the data once, refer back to it |
| `verbose-schema-values` | info | no | enum values with a repeated prefix (STATUS_ACTIVE, STATUS_INACTIVE) pay for that prefix every row | state the shared prefix once, use the suffix per row |
| `dead-instruction` | info | no | an instruction pointing at a structure that isn't actually there ("as shown above") wastes tokens and confuses the model | remove the dangling reference or add what it points to |
| `unlabeled-dynamic` | info | no | a large JSON region not wrapped in dyn() gets counted as static cost when it's really per-request data | wrap it with dyn() |
| `budget-exceeded` | error | no | a declared token budget exists to keep cost and latency predictable, this input broke it | trim static content or tighten dyn() slot samples |
| `baseline-regression` | error | no | a token count creeping up past a recorded baseline usually means an unnoticed prompt or template regression | review what changed since the baseline, re-run with `--update-baseline` if the growth is intentional |

## What's not here yet

- Gemini encoders. They throw a clear error rather than a guessed count. Anthropic has a real encoder with bundled calibration for the current-generation models only; other Claude ids throw until calibrated, same throw-rather-than-guess policy.
- The provider-mechanics rules (cache alignment, context-window fit, schema bloat, and the rest of group D). They need provider profile data this package doesn't have yet, including cache-aware pricing (cache-read vs. base input rates) for those rules specifically.
- The `github`, `sarif`, `markdown`, and `xray-html` reporters. `--verify`, `--fix-aggressive`.
- `diff`, `extract`, `xray`, `init` as CLI commands. `diff()` and `budget()` are stubs that throw as library functions too (the library function, distinct from the `budget init` CLI command above).
- `.js`/`.ts` config file loading, only `.json` works right now.
- `tokensift/mcp`, `tokensift/action`.

## Non-goals

No LLM-powered rewriting here, that's a different product with different trust properties. Analysis is deterministic and offline.

No runtime proxying, request interception or usage dashboards: that space is already covered elsewhere.

tokensift doesn't judge prompt quality. It says "this costs more tokens than an equivalent structure".

No telemetry, accounts or background network calls. The only network calls this will ever make are pricing refreshes and opt-in provider token-count verification, both explicit.

## License

MIT
