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
