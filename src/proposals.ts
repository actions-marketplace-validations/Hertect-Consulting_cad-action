import type { ChangedFile, Finding, ParsedRule, Proposal } from "./types.js";

/**
 * A proposed fix exists only when there is exactly one thing the author can
 * have meant. Two candidates, or none, is no proposal: a wrong suggestion a
 * person accepts in one click is worse than a finding they read.
 */

/** True when `a` and `b` differ only by case. */
function differsByCase(a: string, b: string): boolean {
  return a !== b && a.toLowerCase() === b.toLowerCase();
}

/**
 * True when `a` and `b` differ by one hyphen or underscore: one inserted or
 * removed (`typecheck` / `type-check`) or one swapped for the other
 * (`deploy_staging` / `deploy-staging`). Case-sensitive, so the two rules
 * do not combine into a looser one.
 */
function differsByOneDash(a: string, b: string): boolean {
  if (a === b) return false;
  if (a.length === b.length) {
    let diff = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (diff !== -1 || !"-_".includes(a[i]) || !"-_".includes(b[i])) return false;
      diff = i;
    }
    return diff !== -1;
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  if (longer.length !== shorter.length + 1) return false;
  for (let i = 0; i < longer.length; i++) {
    if (!"-_".includes(longer[i])) continue;
    if (longer.slice(0, i) + longer.slice(i + 1) === shorter) return true;
  }
  return false;
}

/**
 * The one defined script or target that `name` is a near miss of, by case
 * or by a single hyphen or underscore, or undefined when none or several.
 */
export function nearMiss(name: string, defined: Iterable<string>): string | undefined {
  const candidates = [...defined].filter((d) => differsByCase(name, d) || differsByOneDash(name, d));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * The one file in the repository with the same basename as `token`, or
 * undefined when none or several: where a file moved, if the Action can
 * see it. A bare file name has already been looked for everywhere by the
 * dead-path check, so only a path with a folder can be moved.
 */
export function movedFile(token: string, allFiles: string[]): string | undefined {
  const path = token.replace(/^\.\//, "");
  if (!path.includes("/")) return undefined;
  const base = path.split("/").pop() ?? path;
  const candidates = allFiles.filter((f) => f !== path && (f === base || f.endsWith("/" + base)));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** `command` with its script or target name replaced, the rest of the command kept. */
export function renameInCommand(command: string, name: string, replacement: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return command.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`), `$1${replacement}`);
}

/**
 * The fix as a whole line, which is what a GitHub suggested change
 * replaces: the line the finding points at with `from` replaced by `to`.
 * None when the line does not hold `from` exactly once, since the Action
 * would then be guessing which occurrence the finding is about.
 */
export function proposeReplacement(rule: ParsedRule, line: number, from: string, to: string): Proposal | undefined {
  const text = rule.bodyText.split(/\r?\n/)[line - rule.bodyStartLine];
  if (text === undefined || from === to) return undefined;
  if (text.split(from).length !== 2) return undefined;
  return { from, to, replacement: text.replace(from, to), suggested: false };
}

/**
 * The lines of each changed file that are in the pull request's diff, by
 * new line number: the lines GitHub lets a review comment sit on. Context
 * lines count; a file whose patch the API left out has none.
 */
export function linesInDiff(changed: ChangedFile[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const file of changed) {
    if (!file.patch || file.status === "removed") continue;
    const lines = new Set<number>();
    let newLine = 0;
    for (const raw of file.patch.split(/\r?\n/)) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (hunk) {
        newLine = Number(hunk[1]);
        continue;
      }
      if (raw.startsWith("-") || raw.startsWith("\\")) continue;
      lines.add(newLine);
      newLine++;
    }
    out.set(file.path, lines);
  }
  return out;
}

/** Marks each proposal whose line the pull request's diff holds, where a suggested change can be posted. */
export function markSuggested(findings: Finding[], changed: ChangedFile[]): void {
  const inDiff = linesInDiff(changed);
  for (const f of findings) {
    if (f.proposal) f.proposal.suggested = inDiff.get(f.file)?.has(f.line) ?? false;
  }
}
