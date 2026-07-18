import { defineConfig } from "tsup";

// two separate build steps, run in this order -- the library config has
// clean: true and must go first, or it would wipe the CLI's output
export default defineConfig([
  {
    entry: ["src/index.ts"],
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
