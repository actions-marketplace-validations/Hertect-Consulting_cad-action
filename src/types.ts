export type FileKind =
  | "AGENTS"
  | "CLAUDE"
  | "COPILOT"
  | "CURSOR_MDC"
  | "CURSORRULES"
  | "GEMINI"
  | "SKILL";

export interface DiscoveredFile {
  path: string; // repo-relative, forward slashes
  kind: FileKind;
  content: string;
  /** For CLAUDE.md: the content of the file it `@import`s, appended for parsing. */
  importedFrom?: string;
}

export type RuleShape = "five-line" | "heading" | "skill";

export interface ParsedRule {
  file: string;
  kind: FileKind;
  shape: RuleShape;
  title: string;
  titleLine: number;

  whatText?: string;
  whatLine?: number;
  appliesToText?: string;
  appliesToLine?: number;
  checkText?: string;
  checkLine?: number;
  owner?: string;
  reviewed?: string;

  /** Full block text, used by heading-block scanning (checks 1-3). */
  bodyText: string;
  bodyStartLine: number;
}

export type CheckId = "dead-command" | "dead-path" | "no-check" | "no-file" | "contradiction";

export interface Finding {
  check: CheckId;
  file: string;
  /** 1-based; 0 when the finding is about a file that does not exist. */
  line: number;
  sentence: string;
  lookedFor?: string;
  /** The one fix the Action can see, when there is exactly one. A person decides. */
  proposal?: Proposal;
}

/**
 * A fix proposed as a GitHub suggested change: the text on the finding's
 * line that is wrong, what it becomes, and the whole line with the fix
 * applied, which is what the suggestion block holds.
 */
export interface Proposal {
  from: string;
  to: string;
  replacement: string;
  /** True when the line is in the pull request's diff, the only place a suggested change can be posted. */
  suggested: boolean;
}

/**
 * Something worth saying that is not wrong with the repository: shown in the
 * comment above the findings, never counted, never gating.
 */
export interface Note {
  sentence: string;
}

export interface RunOptions {
  root: string;
  extraPaths: string[];
  failOn: "all" | "none" | "dead-only";
  extraAllowCommands: string[];
  /** The pull request's changed files, from the GitHub API; absent outside a pull request. */
  changedFiles?: ChangedFile[];
}

/** One file of a pull request as the GitHub API lists it: its path, what happened to it, and its unified diff. */
export interface ChangedFile {
  path: string;
  status: "added" | "removed" | "modified" | "renamed";
  /** The unified diff; absent for a binary or a very large file. */
  patch?: string;
  previousPath?: string;
}

/**
 * What a pull request did to one instruction file, in instruction terms:
 * who reads it, where it applies, which rules changed, and whose it is.
 */
export interface InstructionChange {
  path: string;
  previousPath?: string;
  kind: FileKind;
  status: ChangedFile["status"];
  /** Tool names, e.g. "Claude Code". */
  readBy: string[];
  /** A short phrase: "the whole repository", a folder, or a glob. */
  appliesTo: string;
  /** Rule titles, by heading, as the diff shows them. */
  added: string[];
  removed: string[];
  edited: string[];
  /** The file's Owner lines at the head commit, verbatim and distinct. Empty when it has none. */
  owners: string[];
}

export interface InventoryTool {
  kind: FileKind;
  /** Human-facing name, e.g. "Cursor rules". */
  label: string;
  fileCount: number;
}

/**
 * What the Action found, independent of whether anything is wrong with it. A
 * repository with no findings still has an inventory, which is the point: it is
 * the one thing this Action can show that a linter cannot.
 */
export interface Inventory {
  fileCount: number;
  ruleCount: number;
  toolCount: number;
  tools: InventoryTool[];
  /** Rules carrying an Owner line. Recorded, not verified. */
  ownedRuleCount: number;
  /** Rules carrying a Reviewed line. Recorded, not judged current. */
  reviewedRuleCount: number;
}

export interface RunResult {
  findings: Finding[];
  ruleCount: number;
  fileCount: number;
  inventory: Inventory;
  notes: Note[];
  /** The instruction files this pull request changed; empty when it changed none or this is not a pull request. */
  instructionChanges: InstructionChange[];
  conclusion: "success" | "failure";
}
