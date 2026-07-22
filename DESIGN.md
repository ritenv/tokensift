# Design notes

Real tradeoffs made while building this, kept short. Expands as decisions change.

## Tokenizer

OpenAI exact counts use gpt-tokenizer for the real o200k_base/cl100k_base BPE ranks. Hand-rolling rank tables was ruled out early: they're tens of thousands of merge rules published by OpenAI, and `confidence: "exact"` is a promise this project makes.

## Cost model

`Finding.cost` is optional for now. There's no pricing table yet, so nothing can compute `perCall`/`atVolume`. Making up numbers here would break the exactness promise. Gets filled in once pricing data is curated.

## Estimate encoders

Gemini throws a clear "not implemented" error instead of returning a guessed count. A guess mislabeled as an estimate is worse than an explicit error.

Anthropic has a real encoder now (`src/encoders/anthropic.ts`), but the same policy applies at the data layer: `resolveEncoder()` throws `no calibration data for '<model>'` for any Claude model id without a real measured calibration record, bundled or local. It does not fall back to a rough guess for an uncalibrated model. See "Anthropic estimate encoder" below for how the encoder itself works, and "calibrate anthropic" for how a calibration record gets produced.

## Anthropic estimate encoder

No public BPE table exists to be exact against, so this is `confidence: "estimate"` by construction, not a temporary gap. The estimator classifies raw text into the same `TokenClass` buckets the OpenAI encoder already reports (word, punct, whitespace, digit-fragment, hex-fragment, other) via character runs, not decoded tokens (there's nothing to decode), then applies one calibrated chars-per-token ratio per class.

A short whitespace run (1-2 chars) gets folded into the run that follows it before estimation, rather than costing its own synthetic token. Real BPE vocabularies routinely merge a leading space into the next token (" the" is one token, not " " + "the"); without this, single-space runs between words each forced `Math.ceil(1/ratio)` up to a full token regardless of how large the ratio was, which measurably inflated every estimate. This matches what `whitespace-run`'s own note already says about short whitespace runs being "basically free" under real tokenizers, applied here to the estimator instead of a lint rule.

`TokenView.tokens` for this encoder are synthetic, not real BPE ids, subdividing each class run into `ceil(run.length / ratio)` evenly-sliced sub-tokens. Verified this doesn't break anything downstream: only two consumers ever look past `TokenView.count` — `analyze.ts`'s `buildRepeatedSubstringIndex(tokenView.tokens)` (used by `repeated-block`, confirmed it still finds real repeated spans against synthetic tokens) and the class histogram/byte-range shape itself, which nothing besides display code inspects.

## calibrate anthropic

`tokensift calibrate anthropic run` is the only network call anywhere in this package, and it only fires when this specific command runs, never from `analyze`/`check`/anything auto-discovered. Same mechanism serves two purposes: the maintainer runs it once against a dedicated fixture corpus (`test/fixtures/calibration/anthropic-samples.json`, not the same file as the template `init` writes) to produce the bundled default; any downstream user can run it again against their own fixtures and their own key to produce a local override that better fits their own content mix, stored separately and preferred over the bundled default per exact model id.

Fitting is a small fixed-point iteration, not a joint least-squares solve: each round, attribute every sample's actual token count across classes in proportion to what the *current* ratios already predict for that class, not proportional to raw char share (a class with a much larger ratio, like whitespace, genuinely earns a smaller token share per char than a dense class like punctuation, and naive char-share attribution ignores that). A final pass rescales all ratios by a single multiplicative correction factor (real predicted total vs. real actual total, using the actual discrete `Math.ceil`-based estimator, not the continuous fitting approximation) since the continuous fit systematically under-corrects for the rounding-up bias `Math.ceil` introduces on every run — verified against a synthetic ground truth this removes most of the remaining bias without needing to model the rounding directly. Disclosed simplification, not a claim of statistical rigor; the resulting `meanAbsPercentError` is measured and stored alongside the ratios, not asserted.

Calibration is keyed by exact model id, not provider family, since real per-model tokenizer behavior can differ across Claude generations. An unrecognized `claude-*` id throws rather than falling back to a sibling model's calibration.

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
