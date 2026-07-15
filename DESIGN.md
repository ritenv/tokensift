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

## Provider profile

`AnalysisContext.providerProfile` has a typed shape (message overhead, cache minimums) but nothing populates it yet. Filling it with unverified numbers would be worse than leaving it empty.

## Build tooling

Started with tsdown, switched to tsup. tsdown pulls in rolldown, which needs `node:util`'s `styleText`, only available on newer Node than the dev machine runs. Consumers only need Node 18+; dev tooling shouldn't demand more.
