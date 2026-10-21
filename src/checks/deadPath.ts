import { dirExists, fileExists, ignoredPaths, listFiles } from "../fs-walk.js";
import { globExpand } from "../glob.js";
import { movedFile, proposeReplacement } from "../proposals.js";
import { extractPathLikeTokens } from "../scan.js";
import type { Finding, ParsedRule } from "../types.js";
import { commandsIn, headingBlockLines, scannableFields } from "./shared.js";

/**
 * First segments that look like a folder in prose but are not one: git
 * remotes and refs, media types, hosts. `origin/main` and
 * `application/json` are backticked in real instruction files.
 */
const NOT_A_FOLDER = new Set([
  "origin",
  "upstream",
  "refs",
  "head",
  "application",
  "text",
  "image",
  "audio",
  "video",
  "font",
  "multipart",
  "message",
  "model",
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "localhost",
]);

/** Folders that are never committed, so a path under them is not held to the head commit. */
const NOT_COMMITTED = new Set(["node_modules", "dist", "build", "coverage"]);

/**
 * Extensions a bare file name in prose is held to. Code extensions stay
 * out: `Node.js`, `three.js` and an illustrative `foo.ts` are names, not
 * paths, far more often than they are stale mentions.
 */
const BARE_NAME_EXTENSIONS = new Set([
  "md",
  "mdc",
  "mdx",
  "txt",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "sh",
  "sql",
  "csv",
  "lock",
]);

type ProsePath =
  | { kind: "glob" }
  | { kind: "in-folder"; folder: string; rest: string }
  | { kind: "missing" }
  | undefined;

/**
 * What a backticked token in prose claims to be, or undefined when it is
 * not held to the head commit. A slash with an extension is a file path; a
 * slash with a glob is a glob when it names files (`src/**` or `*.ts`),
 * not branches (`design/*`); a bare name with a document-like extension is
 * a file somewhere in the repository. Existence is checked on disk, not in
 * the walked listing, which skips dot directories and `lib/`.
 * `scripts/rotate-keys.sh` after the script moved is the case this exists for.
 */
function classifyProsePath(root: string, token: string, allFiles: string[]): ProsePath {
  const path = token.replace(/^\.\//, "");
  const slash = path.indexOf("/");
  const hasGlob = path.includes("*");
  const hasExtension = /\.[A-Za-z0-9]{1,8}$/.test(path);

  if (slash > 0) {
    const folder = path.slice(0, slash);
    if (NOT_A_FOLDER.has(folder.toLowerCase()) || NOT_COMMITTED.has(folder)) return undefined;
    if (hasGlob) {
      const namesFiles = path.includes("**") || /\.[A-Za-z0-9*]+$/.test(path.split("/").pop() ?? "");
      if (!namesFiles || folder.startsWith(".")) return undefined;
      return globExpand(path, allFiles).length === 0 ? { kind: "glob" } : undefined;
    }
    if (!hasExtension || fileExists(root, path)) return undefined;
    if (dirExists(root, folder)) {
      return { kind: "in-folder", folder: folder + "/", rest: path.slice(slash + 1) };
    }
    return { kind: "missing" };
  }

  if (slash === 0 || hasGlob || path.startsWith(".")) return undefined;
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(path)?.[1].toLowerCase();
  if (!ext || !BARE_NAME_EXTENSIONS.has(ext)) return undefined;
  if (allFiles.some((f) => f === path || f.endsWith("/" + path))) return undefined;
  return { kind: "missing" };
}

function proseSentence(token: string, claim: NonNullable<ProsePath>): string {
  if (claim.kind === "glob") return `Dead path: \`${token}\` matches no files at the head commit.`;
  if (claim.kind === "in-folder") {
    return `Dead path: \`${token}\` — \`${claim.folder}\` exists but has no \`${claim.rest}\`.`;
  }
  return `Dead path: \`${token}\` does not exist at the head commit.`;
}

/**
 * The fix for a path whose file the Action can see elsewhere, as the one
 * file with that basename: the path rewritten on the line, as a suggested
 * change. `scripts/rotate-keys.sh` after the script moved to `tools/` is the case.
 */
function proposeMove(rule: ParsedRule, line: number, token: string, allFiles: string[]) {
  const moved = movedFile(token, allFiles);
  return moved ? proposeReplacement(rule, line, token, moved) : undefined;
}

export function checkDeadPath(root: string, rules: ParsedRule[]): Finding[] {
  const allFiles = listFiles(root);
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    for (const bodyLine of headingBlockLines(rule)) {
      const { line } = bodyLine;
      for (const span of commandsIn(bodyLine)) {
        for (const token of extractPathLikeTokens(span)) {
          const claim = classifyProsePath(root, token, allFiles);
          if (!claim) continue;
          const key = `${rule.file}:${line}:${token}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({
            check: "dead-path",
            file: rule.file,
            line,
            sentence: proseSentence(token, claim),
            lookedFor: token,
            proposal: proposeMove(rule, line, token, allFiles),
          });
        }
      }
    }

    for (const field of scannableFields(rule)) {
      for (const token of extractPathLikeTokens(field.text)) {
        const key = `${rule.file}:${field.line}:${token}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (token.includes("*")) {
          const matches = globExpand(token, allFiles);
          if (matches.length === 0) {
            findings.push({
              check: "dead-path",
              file: rule.file,
              line: field.line,
              sentence: `Dead path: \`${token}\` matches no files at the head commit.`,
              lookedFor: token,
            });
          }
        } else if (!fileExists(root, token)) {
          findings.push({
            check: "dead-path",
            file: rule.file,
            line: field.line,
            sentence: `Dead path: \`${token}\` does not exist at the head commit.`,
            lookedFor: token,
            proposal: proposeMove(rule, field.line, token, allFiles),
          });
        }
      }
    }
  }

  // A path git ignores is absent by design (a build output, a local secret),
  // so a rule that names it is not stale. Globs are left as they are.
  const exact = findings.filter((f) => f.lookedFor && !f.lookedFor.includes("*"));
  const ignored = ignoredPaths(root, exact.map((f) => (f.lookedFor as string).replace(/^\.\//, "")));
  return findings.filter((f) => !f.lookedFor || !ignored.has(f.lookedFor.replace(/^\.\//, "")));
}
