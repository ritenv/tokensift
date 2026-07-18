import { run } from "./cli/run.js";

const result = await run(process.argv.slice(2), process.cwd());
process.stdout.write(`${result.output}\n`);
process.exit(result.exitCode);
