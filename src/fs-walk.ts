import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "lib",
  "coverage",
  ".next",
  ".turbo",
]);

/** Recursively lists every file under `root`, as repo-relative POSIX paths. */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github" && entry.name !== ".cursor" && entry.name !== ".cursorrules") {
        continue;
      }
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

export function readRepoFile(root: string, relPath: string): string {
  return readFileSync(join(root, relPath), "utf8");
}

export function fileExists(root: string, relPath: string): boolean {
  try {
    return statSync(join(root, relPath)).isFile();
  } catch {
    return false;
  }
}

/** True for a directory at `relPath`, including ones `listFiles` does not walk (dot directories, `lib/`). */
export function dirExists(root: string, relPath: string): boolean {
  try {
    return statSync(join(root, relPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The subset of `paths` that git ignores at `root`, by asking git itself. A
 * path that is ignored is not expected at the head commit, so a rule naming
 * it is not stale. Empty when git is unavailable or `root` is not a checkout.
 */
export function ignoredPaths(root: string, paths: string[]): Set<string> {
  if (paths.length === 0) return new Set();
  try {
    const stdout = execFileSync("git", ["check-ignore", "--", ...paths], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(stdout.split(/\r?\n/).filter(Boolean));
  } catch {
    // Exit 1 means none are ignored; anything else means git gave no answer.
    return new Set();
  }
}
