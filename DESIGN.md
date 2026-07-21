# Design notes

Real tradeoffs made while building this, kept short. Expands as decisions change.

## Tokenizer

OpenAI exact counts use gpt-tokenizer for the real o200k_base/cl100k_base BPE ranks. Hand-rolling rank tables was ruled out early: they're tens of thousands of merge rules published by OpenAI, and `confidence: "exact"` is a promise this project makes.

## Cost model

`Finding.cost` is optional for now. There's no pricing table yet, so nothing can compute `perCall`/`atVolume`. Making up numbers here would break the exactness promise. Gets filled in once pricing data is curated.

## Estimate encoders

Anthropic and Gemini encoders throw a clear "not implemented" error instead of returning a guessed count. A guess mislabeled as an estimate is worse than an explicit error.

## Repeated-substring engine

The suffix automaton gives occurrence counts in O(n). Turning counts into full occurrence lists means re-scanning the token stream per reported span, O(n) per span instead of O(1). Fine at prompt scale. Would need real work for a token repeated thousands of times in one payload.

## whitespace-run threshold

o200k_base merges long runs of spaces or newlines into a single token, so short runs are basically free. `whitespace-run` only fires when collapsing the run actually saves tokens, not just whenever it looks messy.

## high-entropy-string

No entropy math. It just checks chars-per-token like `uuid-bloat` does. Real secrets land under 2.5 chars/token, normal identifiers land at 4+, gap's wide enough that a fancier formula wouldn't buy much.

## repeated-block vs duplicate-message-content

Yeah these overlap. `repeated-block` just finds repeated text, doesn't know about messages. `duplicate-message-content` compares whole messages and tells you which role/index, useful for catching a system prompt that leaked into a user turn. Kept both.

## filler lexicon

Small on purpose. Judging tone edges toward judging prompt quality, which we don't do. Can grow this later, maybe make it configurable.

## redundant-structure vs repeated-block

Spec describes catching the same data shown twice in different serializations, JSON and a markdown table, say. That needs a table parser we don't have, so scope is narrower: same parsed JSON value appearing twice. Checked this against `repeated-block` directly: for a byte-identical duplicate, `repeated-block` already catches it, so `redundant-structure` is redundant with it there. The case it actually adds is a duplicate that's been reformatted, pretty-printed once and minified once, say, same value, no shared literal text, so the suffix automaton finds nothing. `redundant-structure` compares parsed values instead of raw text, so it still catches that one. Both rules stay, but the real justification is the reformatted case, not the copy-paste case.

## dead-instruction

Regex plus proximity checks, not real reference resolution. Looks for phrases like "as shown above" and checks whether a JSON region or code fence actually sits on the right side. Cheap and conservative on purpose, false negatives beat false positives here.

## unlabeled-dynamic scope

Only fires on JSON regions, not "anything that looks dynamic." A generic version of this is just high-entropy-string again. JSON blocks are the case that actually matters for cache alignment later.

## thresholds are tuned against OpenAI's tokenizer, not universal

`high-entropy-string`'s 3 chars/token cutoff, `repeated-block`'s 8-token minimum, `unlabeled-dynamic`'s 30-token minimum, all fit to o200k_base by actually tokenizing real strings. Worth re-checking once Anthropic's encoder ships instead of assuming they transfer. Most other rules compare real before/after token counts, so they self-calibrate to whatever encoder runs.

## applyFixes and JSON inputs

`Report.applyFixes()` splices fixes into `AnalysisContext.text`, which is the joined string `analyze()` builds internally. For plain-string input that's just the original text, so fixes land exactly where they should. For `Message[]`/`Payload` input it's a reconstruction (messages joined with `"\n"`), not the original file bytes, so a fix range doesn't map back to a real position in a JSON source file. Doing that properly needs a JSON parser that tracks source offsets per value through JSON's string escaping, plus a way to re-serialize without reformatting the whole file over one fix. Real feature, not attempted here. The CLI's `--write` refuses JSON input outright instead of guessing.

## baseline-regression and where the baseline lives

The rule itself only knows a plain number: `ctx.baseline`, the previously recorded token count, compared against a fixed 10% tolerance. It doesn't know about files or JSON on disk, same split as `budget-exceeded`. The CLI owns the actual state: `.tokensift/baseline.json` maps file path (relative to cwd) to token count, written by `--update-baseline` and read on every run after. `createLinter().analyze()` takes an optional per-call `{ baseline }` override so the CLI can look up a different baseline per file without building a new linter each time.

10% is a constant in the rule file, not a config option. Same reasoning as the other fixed thresholds: one more number nobody would tune correctly without real data on what "normal" drift looks like.

## check vs analyze

Separate command, not `analyze --ci` or similar. `check` is meant to be a fixed CI gate: no `--fix`, `--write`, `--max-warnings`, or rule overrides, just exit 0 or 2. Keeping it a distinct entry point means it can't accidentally grow those flags later. It reads per-file budgets and baselines from `.tokensift/budgets.json` / `.tokensift/baseline.json` instead of `analyze`'s single global `Config.budget`, so `createLinter().analyze()` takes `budget` as a per-call override too now, same as `baseline` already did.

## toMatchTokenBaseline and test identity

Needs a stable key per assertion to know which baseline belongs to which test. Jest and Vitest both pass a matcher context with `testPath` and `currentTestName` to `expect.extend` matchers (part of the interop contract Vitest deliberately kept compatible with Jest's), so the key is `${testPath} > ${currentTestName}` rather than anything this package invents. Storage and tolerance mirror the CLI's `baseline-regression`/`--update-baseline` exactly, same `TOLERANCE_PCT` constant, same "record on first run, compare after" shape, just keyed by test identity instead of file path, and stored at `.tokensift/matcher-baselines.json` instead of `.tokensift/baseline.json`.

No environment detection anywhere in the matcher itself, same input always produces the same result. A missing baseline always gets created and passes, whether that run happens to be on CI or not. Whether an uncommitted baseline file is a problem for a given CI setup is the user's call, not this package's to guess at.

## Provider profile

`AnalysisContext.providerProfile` has a typed shape (message overhead, cache minimums) but nothing populates it yet. Filling it with unverified numbers would be worse than leaving it empty.

## Build tooling

Started with tsdown, switched to tsup. tsdown pulls in rolldown, which needs `node:util`'s `styleText`, only available on newer Node than the dev machine runs. Consumers only need Node 18+; dev tooling shouldn't demand more.
