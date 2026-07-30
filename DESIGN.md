# Design notes

Some thinking-aloud here. Some decisions may not make sense so they are explained here.

## Cost model

- `report.summary.cost.atVolume` is only set when every finding has one, so that a partial sum doesn't end up understating the real total.
- `tokensift pricing update` writes `.tokensift/pricing-overrides.json` instead of touching bundled data, since mutating `node_modules` is fragile and gets wiped on reinstall.
- Pricing ingestion (`pnpm pricing:update`) is a manual script, not a build step, since pricing goes stale on its own schedule, unrelated to releases.

## Anthropic estimate mode

- Gemini throws "not implemented" as it's not currently supported.
- Anthropic ships a real calibrated encoder, but only for models with a real measured calibration record (bundled or local). An uncalibrated Claude id throws rather than falling back to a rough guess.
- Calibration is keyed by exact model id, not provider family, in case tokenizer behavior ever diverges across Claude generations (as of now, it doesn't).
- The calibration math is a simple approximation, not a rigorous statistical fit, and it says so rather than pretending otherwise. Its real accuracy (`meanAbsPercentError`) is measured against actual samples and saved, not just assumed to be good.
- `tokensift calibrate anthropic run` is the only network call in the package, and only runs when that exact command is invoked.

## Why several rules look like they overlap

- `repeated-block` vs `duplicate-message-content`: one finds any repeated text, the other compares whole messages and names the role/index (catches a system prompt leaked into a user turn). Both kept.
- `repeated-block` skips a span whose every occurrence sits fully inside a JSON region, since the suffix automaton otherwise flags meaningless repeated punctuation across sibling rows, already `row-json`/`long-keys`'s job to describe.
- `redundant-structure` vs `repeated-block`: for a byte-identical duplicate, `repeated-block` already catches it. `redundant-structure` only earns its keep on a *reformatted* duplicate (pretty vs minified, same value, no shared literal text), since it compares parsed values instead of raw text.

## row-json / long-keys / verbose-schema-values

- `row-json` and `long-keys` are alternative strategies for the same waste (CSV/columnar vs short-keys-plus-legend), not independent savings. `totalWasteTokens` dedupes by exact `loc.range` match, keeping only the largest claim per distinct range, deliberately exact-range rather than any-overlap, so a narrower *composable* fix nested inside (`digit-fragmentation` on one timestamp inside an array `row-json` restructures) still gets summed instead of swallowed.
- Known gap: `verbose-schema-values` reports the whole region's range (it's a cross-row pattern, not a per-field span), so it still collides with `row-json`/`long-keys` there even though it's actually composable with them.
- `findUniformObjectArrays` also checks a wrapped array (`{"actions": [...]}`, the standard shape for real tool-calling APIs), not just a bare top-level array, locating its exact source span, and stays scoped to this one service rather than `findJsonRegions` itself so `pretty-json` doesn't start double-firing on both an outer object and its nested array.

## Other rule notes

- `whitespace-run` only fires when collapsing a run actually saves tokens, since o200k_base merges whitespace efficiently enough that real hits need ~100+ chars, a narrower rate than "collapse messy whitespace" implies.
- `high-entropy-string` uses chars-per-token, not real entropy math, same as `uuid-bloat`, and SCREAMING_SNAKE_CASE enums sit right at that threshold from underscores compressing worse than prose, not from entropy, so they get a dedicated bypass.
- `findJsonRegions` skips empty arrays/objects (markdown checkboxes like `- [ ]` parse as one) and tolerates a literal unescaped newline inside a JSON string (common in hand-written multi-line notes, invalid per strict JSON grammar).
- `filler` lexicon is small on purpose, since judging tone edges toward judging prompt quality, which this project doesn't do.
- `dead-instruction` is regex plus proximity checks, not real reference resolution, cheap and conservative on purpose since false negatives beat false positives here.
- `unlabeled-dynamic` only fires on JSON regions, not "anything that looks dynamic" (a generic version is just `high-entropy-string` again).
- Several thresholds (`high-entropy-string`'s 3 chars/token, `repeated-block`'s 8-token minimum, `unlabeled-dynamic`'s 30-token minimum) are fit to OpenAI's tokenizer specifically, worth re-checking against Anthropic's encoder rather than assuming they transfer.

## applyFixes and JSON inputs

Byte-faithful for plain-string input, but for `Message[]`/`Payload` input `applyFixes()` works against a reconstructed joined string, so a fix range doesn't map back to real file bytes. The CLI's `--write` refuses `.json` input outright instead of guessing.

## CLI state (budgets, baselines, check)

- Baseline/budget values live in `.tokensift/baseline.json` / `.tokensift/budgets.json`, not in the rules themselves, so the same rule works whether the CLI or a library caller supplies the number.
- The 10% baseline tolerance is a hardcoded constant, not a config option, since nobody would tune it correctly without real drift data.
- `check` is a separate command from `analyze`, not a flag, so it can't accidentally grow `--fix`/`--write`/rule-override options later.
- `toMatchTokenBaseline` is keyed by test identity (`testPath > currentTestName`), since a snapshot-style baseline needs to know which test it belongs to.
- It skips CI-environment detection entirely, so the same input always produces the same result, on purpose.

## Provider profile

`AnalysisContext.providerProfile` has a typed shape but nothing populates it yet, since unverified numbers would be worse than empty.
