---
"tokensift": minor
---

Add below-cache-minimum rule (D2): flags a dyn()-marked prompt whose static prefix is shorter than the model's real minimum cacheable length, so it can never be cached regardless of ordering
