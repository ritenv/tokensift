---
"tokensift": major
---

analyze(), tokenize(), resolveEncoder(), budget(), createLinter(...).analyze, and the test matchers are now async. OpenAI tokenizer data now loads lazily via a dynamic import, only for the family actually used, instead of loading both eagerly. Migration: add await.
