import { defineConfig } from "tsup";

// two separate build steps, run in this order -- the library config has
// clean: true and must go first, or it would wipe the CLI's output
export default defineConfig([
  {
    // encoders/o200k and encoders/cl100k are separate entries, not just
    // separate source files, so a downstream bundler importing one subpath
    // never pulls the other family's multi-megabyte BPE rank table in
    // (bundle-size-sensitive environments like edge functions); verified by
    // bundling a minimal consumer against dist/ and checking output size.
    entry: {
      index: "src/index.ts",
      matchers: "src/matchers.ts",
      "encoders/o200k": "src/encoders/openai-o200k.ts",
      "encoders/cl100k": "src/encoders/openai-cl100k.ts",
      // one entry per rule, same reasoning as the encoders above: importing a rule through
      // ./rules/index.ts drags in every other rule's weight too, including encoder-mismatch's
      // ~3.5MB (it needs resolveEncoder for real). A bundler can't untangle that on its own,
      // these give each rule its own real module boundary instead of hoping for tree-shaking.
      "rules/base64-blob": "src/rules/base64-blob.ts",
      "rules/baseline-regression": "src/rules/baseline-regression.ts",
      "rules/below-cache-minimum": "src/rules/below-cache-minimum.ts",
      "rules/budget-exceeded": "src/rules/budget-exceeded.ts",
      "rules/cache-buster": "src/rules/cache-buster.ts",
      "rules/dead-instruction": "src/rules/dead-instruction.ts",
      "rules/digit-fragmentation": "src/rules/digit-fragmentation.ts",
      "rules/duplicate-message-content": "src/rules/duplicate-message-content.ts",
      "rules/encoder-mismatch": "src/rules/encoder-mismatch.ts",
      "rules/filler": "src/rules/filler.ts",
      "rules/high-entropy-string": "src/rules/high-entropy-string.ts",
      "rules/html-whitespace": "src/rules/html-whitespace.ts",
      "rules/long-keys": "src/rules/long-keys.ts",
      "rules/pretty-json": "src/rules/pretty-json.ts",
      "rules/redundant-structure": "src/rules/redundant-structure.ts",
      "rules/repeated-block": "src/rules/repeated-block.ts",
      "rules/row-json": "src/rules/row-json.ts",
      "rules/unicode-punct": "src/rules/unicode-punct.ts",
      "rules/unlabeled-dynamic": "src/rules/unlabeled-dynamic.ts",
      "rules/uuid-bloat": "src/rules/uuid-bloat.ts",
      "rules/verbose-schema-values": "src/rules/verbose-schema-values.ts",
      "rules/whitespace-run": "src/rules/whitespace-run.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
    onSuccess: async () => {
      const { chmodSync } = await import("node:fs");
      chmodSync("dist/cli.js", 0o755);
    },
  },
]);
