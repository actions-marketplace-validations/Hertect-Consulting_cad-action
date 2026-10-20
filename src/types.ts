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
  conclusion: "success" | "failure";
}
