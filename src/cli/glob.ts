import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

function hasWildcard(segment: string): boolean {
  return segment.includes("*");
}

function segmentToRegex(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function subdirsOf(dir: string): string[] {
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter(isDir);
}

function entriesOf(dir: string): string[] {
  return isDir(dir) ? readdirSync(dir) : [];
}

function resolveSegments(baseDir: string, segments: string[]): string[] {
  if (segments.length === 0) {
    return isFile(baseDir) ? [baseDir] : [];
  }
  const [seg, ...rest] = segments as [string, ...string[]];

  if (seg === "**") {
    // "**" can match zero directories, so try the rest of the pattern here
    // directly, not just after descending at least one level.
    let matches = resolveSegments(baseDir, rest);
    for (const dir of subdirsOf(baseDir)) {
      matches = matches.concat(resolveSegments(dir, segments));
    }
    return matches;
  }

  if (!hasWildcard(seg)) {
    return resolveSegments(join(baseDir, seg), rest);
  }

  const regex = segmentToRegex(seg);
  return entriesOf(baseDir)
    .filter((entry) => regex.test(entry))
    .flatMap((entry) => resolveSegments(join(baseDir, entry), rest));
}

// Supports only "*" (single path segment) and "**" (recursive, zero or more
// segments) -- the only pattern shapes real usage needs. No "?", braces, or
// character classes.
export function resolveGlob(pattern: string, cwd: string): string[] {
  if (!hasWildcard(pattern)) {
    const resolved = isAbsolute(pattern) ? pattern : join(cwd, pattern);
    return isFile(resolved) ? [resolved] : [];
  }

  const base = isAbsolute(pattern) ? "/" : cwd;
  const raw = isAbsolute(pattern) ? pattern.slice(1) : pattern;
  const segments = raw.split("/").filter((s) => s.length > 0);
  return resolveSegments(base, segments).sort();
}
