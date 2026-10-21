import { classify } from "./discovery.js";
import { parseFile } from "./parser.js";
import type { ChangedFile, DiscoveredFile, FileKind, InstructionChange } from "./types.js";

/**
 * The tools that read a file of each kind. AGENTS.md is the shared file:
 * Codex reads it as its own, and Cursor and Copilot read it alongside their
 * rules. A SKILL.md is loaded by the tools that load skills.
 */
const READERS: Record<FileKind, string[]> = {
  AGENTS: ["Codex", "Cursor", "Copilot"],
  CLAUDE: ["Claude Code"],
  COPILOT: ["Copilot"],
  CURSOR_MDC: ["Cursor"],
  CURSORRULES: ["Cursor"],
  GEMINI: ["Gemini"],
  SKILL: ["Claude Code", "Codex"],
};

/** The value of one frontmatter key (`globs:`), or undefined when the file has no frontmatter or no such key. */
function frontmatterValue(content: string, key: string): string | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return undefined;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return undefined;
    const m = new RegExp(`^${key}:\\s*(.*)$`, "i").exec(lines[i]);
    if (m) return m[1].trim();
  }
  return undefined;
}

/**
 * Where the file applies, in the reader's terms: the whole repository for
 * a root file, the folder for a nested one, the `globs:` frontmatter for a
 * Cursor rule, and the skill's own folder for a SKILL.md, which is loaded
 * when invoked rather than always on.
 */
function appliesTo(path: string, kind: FileKind, content: string | undefined): string {
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  if (kind === "SKILL") return folder ? `when the skill is invoked (\`${folder}\`)` : "when the skill is invoked";
  if (kind === "CURSOR_MDC") {
    const globs = content ? frontmatterValue(content, "globs") : undefined;
    if (globs) return `\`${globs}\``;
    const always = content ? frontmatterValue(content, "alwaysApply") : undefined;
    return always === "true" ? "the whole repository" : "when Cursor attaches the rule";
  }
  if (kind === "COPILOT" || kind === "CURSORRULES") return "the whole repository";
  return folder ? `\`${folder}\`` : "the whole repository";
}

/** The `## ` heading text of a diff line, with a five-line `Rule:` prefix removed, or undefined. */
function headingOf(text: string): string | undefined {
  const m = /^##\s+(.*)$/.exec(text);
  return m ? m[1].replace(/^Rule:\s*/i, "").trim() : undefined;
}

/**
 * The rule each line of the head content sits under, from the same parser
 * the checks use, so a changed line is named by the rule the Action reads
 * it as. Lines before the first rule (frontmatter, a lone title) are none.
 */
function sectionIndex(file: DiscoveredFile | undefined): (line: number) => string | undefined {
  if (!file) return () => undefined;
  const rules = parseFile(file);
  return (line: number) => {
    let title: string | undefined;
    for (const rule of rules) {
      if (rule.titleLine <= line) title = rule.title;
    }
    return title;
  };
}

interface RuleChanges {
  added: string[];
  removed: string[];
  edited: string[];
}

/**
 * Walks a unified diff and names the rules it touches: a `## ` heading on a
 * `+` line is a rule added, on a `-` line a rule removed, and any other
 * changed line is an edit to the rule it sits under at the head commit. A
 * heading both removed and added is one rule edited. Removed lines are
 * placed by the new line before them, which is the rule they left.
 */
function rulesChanged(patch: string | undefined, sectionAt: (line: number) => string | undefined): RuleChanges {
  const added = new Set<string>();
  const removed = new Set<string>();
  const edited = new Set<string>();
  if (!patch) return { added: [], removed: [], edited: [] };

  let newLine = 0;
  for (const raw of patch.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
    const marker = raw[0];
    const text = raw.slice(1);
    const blank = text.trim() === ""; // a blank line moved is not a rule edited
    if (marker === "+") {
      const heading = headingOf(text);
      if (heading) added.add(heading);
      else if (!blank) {
        const section = sectionAt(newLine);
        if (section) edited.add(section);
      }
      newLine++;
    } else if (marker === "-") {
      const heading = headingOf(text);
      if (heading) removed.add(heading);
      else if (!blank) {
        const section = sectionAt(Math.max(newLine - 1, 1));
        if (section) edited.add(section);
      }
    } else {
      newLine++;
    }
  }

  for (const title of [...added]) {
    if (removed.has(title)) {
      added.delete(title);
      removed.delete(title);
      edited.add(title);
    }
  }
  for (const title of [...edited]) {
    if (added.has(title) || removed.has(title)) edited.delete(title);
  }
  return { added: [...added], removed: [...removed], edited: [...edited] };
}

/** In a file that is new, every rule is added, including one with no heading of its own. */
function forStatus(rules: RuleChanges, status: ChangedFile["status"]): RuleChanges {
  if (status !== "added") return rules;
  return { added: [...rules.edited, ...rules.added], removed: [], edited: [] };
}

/** The distinct Owner lines of the file at the head commit, in order of appearance. */
function ownersOf(file: DiscoveredFile | undefined): string[] {
  if (!file) return [];
  const owners: string[] = [];
  for (const rule of parseFile(file)) {
    const owner = rule.owner?.trim();
    if (owner && !owners.includes(owner)) owners.push(owner);
  }
  return owners;
}

/**
 * What a pull request did to the instruction layer, file by file, for the
 * files the Action knows. A changed file of any other kind is not listed.
 * `files` is the head commit as discovered, so a removed file has no head
 * content and is described from its path and its diff alone.
 */
export function explainInstructionChanges(changed: ChangedFile[], files: DiscoveredFile[]): InstructionChange[] {
  const out: InstructionChange[] = [];
  for (const change of changed) {
    const kind = classify(change.path);
    if (!kind) continue;
    const head = change.status === "removed" ? undefined : files.find((f) => f.path === change.path);
    const rules = forStatus(rulesChanged(change.patch, sectionIndex(head)), change.status);
    out.push({
      path: change.path,
      previousPath: change.previousPath,
      kind,
      status: change.status,
      readBy: READERS[kind],
      appliesTo: appliesTo(change.path, kind, head?.content),
      ...rules,
      owners: ownersOf(head),
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
