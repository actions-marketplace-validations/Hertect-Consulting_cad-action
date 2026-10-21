import { dirname, join, normalize, sep } from "node:path";
import { fileExists, listFiles, readRepoFile } from "./fs-walk.js";
import { globExpand } from "./glob.js";
import type { DiscoveredFile, FileKind } from "./types.js";

/** The kind the Action reads a path as, or undefined for a file it does not read. */
export function classify(path: string): FileKind | undefined {
  const base = path.split("/").pop() ?? path;
  if (base === "AGENTS.md") return "AGENTS";
  if (base === "CLAUDE.md") return "CLAUDE";
  if (path === ".github/copilot-instructions.md") return "COPILOT";
  if (base === ".cursorrules") return "CURSORRULES";
  if (base.endsWith(".mdc") && path.startsWith(".cursor/rules/")) return "CURSOR_MDC";
  if (base === "GEMINI.md") return "GEMINI";
  if (base === "SKILL.md") return "SKILL";
  return undefined;
}

/**
 * Resolves one level of a CLAUDE.md `@import`. An import line is a line
 * whose only content is `@<relative-path>` (optionally surrounded by
 * whitespace). Only the first such line is followed, and only one level
 * deep — an `@import` inside the imported file is not followed again.
 */
function resolveImport(root: string, claudePath: string, content: string): string | undefined {
  const importLine = content.split(/\r?\n/).find((line) => /^@\S+\s*$/.test(line.trim()));
  if (!importLine) return undefined;
  const importPath = importLine.trim().slice(1);
  const resolved = normalize(join(dirname(claudePath), importPath)).split(sep).join("/");
  if (fileExists(root, resolved)) {
    return readRepoFile(root, resolved);
  }
  return undefined;
}

export interface DiscoverOptions {
  extraPaths?: string[];
}

export function discoverFiles(root: string, options: DiscoverOptions = {}): DiscoveredFile[] {
  const allFiles = listFiles(root);
  const found: DiscoveredFile[] = [];

  for (const path of allFiles) {
    const kind = classify(path);
    if (!kind) continue;
    const content = readRepoFile(root, path);
    const file: DiscoveredFile = { path, kind, content };
    if (kind === "CLAUDE") {
      file.importedFrom = resolveImport(root, path, content);
    }
    found.push(file);
  }

  for (const pattern of options.extraPaths ?? []) {
    if (!pattern.trim()) continue;
    for (const path of globExpand(pattern.trim(), allFiles)) {
      if (found.some((f) => f.path === path)) continue;
      found.push({ path, kind: guessExtraKind(path), content: readRepoFile(root, path) });
    }
  }

  return found.sort((a, b) => a.path.localeCompare(b.path));
}

function guessExtraKind(path: string): FileKind {
  return classify(path) ?? "AGENTS";
}
