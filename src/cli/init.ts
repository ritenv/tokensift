import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requireValue } from "./args.js";
import type { RunResult } from "./types.js";

interface InitOptions {
  model: string;
  force: boolean;
}

function parseInitArgs(argv: string[]): InitOptions {
  let model = "gpt-4o";
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    switch (arg) {
      case "--model":
        model = requireValue(argv, ++i, "--model");
        continue;
      case "--force":
        force = true;
        continue;
      default:
        throw new Error(`unknown flag '${arg}'`);
    }
  }
  return { model, force };
}

const githubActionSnippet = (model: string) => `name: tokensift
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx tokensift check "prompts/**/*.md" --model ${model}
`;

const preCommitSnippet = (model: string) => `#!/bin/sh
# copy into your existing pre-commit hook (e.g. .husky/pre-commit)
npx tokensift check "prompts/**/*.md" --model ${model} || exit 1
`;

const matcherSetupSnippet = `// copy into your test setup file
import "tokensift/matchers";

// then in a test:
// expect(prompt).toBeUnderTokens(2000, { model: "gpt-4o" });
// expect(payload).toHaveNoTokensiftErrors({ model: "gpt-4o" });
`;

function writeIfAbsent(
  path: string,
  content: string,
  force: boolean,
  written: string[],
  skipped: string[],
): void {
  if (existsSync(path) && !force) {
    skipped.push(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  written.push(path);
}

export function runInit(argv: string[], cwd: string): RunResult {
  try {
    const options = parseInitArgs(argv);
    const written: string[] = [];
    const skipped: string[] = [];

    writeIfAbsent(
      join(cwd, "tokensift.config.json"),
      `${JSON.stringify({ model: options.model }, null, 2)}\n`,
      options.force,
      written,
      skipped,
    );
    // reference snippets only, not written into .github/workflows or an actual
    // pre-commit hook directly: those are places the user's own tooling owns,
    // auto-installing into them risks silently enabling CI or clobbering an
    // existing hook. .tokensift/ is this project's own namespace to write into.
    writeIfAbsent(
      join(cwd, ".tokensift", "github-action-snippet.yml"),
      githubActionSnippet(options.model),
      options.force,
      written,
      skipped,
    );
    writeIfAbsent(
      join(cwd, ".tokensift", "pre-commit-snippet.sh"),
      preCommitSnippet(options.model),
      options.force,
      written,
      skipped,
    );
    writeIfAbsent(
      join(cwd, ".tokensift", "matcher-setup-snippet.ts"),
      matcherSetupSnippet,
      options.force,
      written,
      skipped,
    );

    const lines: string[] = [];
    for (const path of written) lines.push(`wrote ${path}`);
    for (const path of skipped) {
      lines.push(`skipped ${path} (already exists, pass --force to overwrite)`);
    }
    lines.push(
      "",
      "next steps:",
      "  - review tokensift.config.json",
      "  - copy .tokensift/github-action-snippet.yml into .github/workflows/ if you want CI checks",
      "  - copy .tokensift/pre-commit-snippet.sh into your existing pre-commit hook",
      "  - copy .tokensift/matcher-setup-snippet.ts into your test setup",
    );

    return { exitCode: 0, output: lines.join("\n") };
  } catch (err) {
    return { exitCode: 3, output: `error: ${(err as Error).message}` };
  }
}
