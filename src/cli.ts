import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { run } from "./cli/run.js";

// depth here must match dist/cli.js's depth (both one level below package root), not src/cli/run.ts's
const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
const { version } = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

const result = await run(process.argv.slice(2), process.cwd(), version);
process.stdout.write(`${result.output}\n`);
process.exit(result.exitCode);
