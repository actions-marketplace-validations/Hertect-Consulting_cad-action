import { dirExists } from "../fs-walk.js";
import type { DiscoveredFile, FileKind, Finding, Note } from "../types.js";

interface KnownTool {
  tool: string;
  kinds: FileKind[];
  /** Where the file would be; reported as the finding's file since there is no line to point at. */
  path: string;
  /** What the tool reads, in the words a reader would use to create it. */
  reads: string;
  /** The tool's own folder: present without the file, the tool is in use and reads nothing. */
  folder: string;
}

/**
 * The tools the Action knows, and the file each one reads. A SKILL.md is
 * shared between tools and counts for none of them. A repository with no
 * file for a tool gives that tool nothing to follow, which is the quietest
 * way an instruction layer can be wrong.
 */
const KNOWN_TOOLS: KnownTool[] = [
  { tool: "Codex", kinds: ["AGENTS"], path: "AGENTS.md", reads: "AGENTS.md", folder: ".codex" },
  { tool: "Claude Code", kinds: ["CLAUDE"], path: "CLAUDE.md", reads: "CLAUDE.md", folder: ".claude" },
  {
    tool: "Cursor",
    kinds: ["CURSOR_MDC", "CURSORRULES"],
    path: ".cursor/rules",
    reads: ".cursor/rules/*.mdc or .cursorrules",
    folder: ".cursor",
  },
  {
    tool: "Copilot",
    kinds: ["COPILOT"],
    path: ".github/copilot-instructions.md",
    reads: ".github/copilot-instructions.md",
    folder: ".github/instructions",
  },
  { tool: "Gemini", kinds: ["GEMINI"], path: "GEMINI.md", reads: "GEMINI.md", folder: ".gemini" },
];

export interface NoInstructionFileResult {
  findings: Finding[];
  notes: Note[];
}

/**
 * A missing file is a finding when the repository has no instruction file
 * at all, or when the tool's own folder is there without it: in both the
 * tool is in use and reads nothing. A repository that only uses Claude Code
 * is not wrong for lacking a GEMINI.md, so the other tools are a note, not
 * a finding, and never fail the check.
 */
export function checkNoInstructionFile(root: string, files: DiscoveredFile[]): NoInstructionFileResult {
  const present = new Set(files.map((f) => f.kind));
  const hasAnyInstructionFile = files.some((f) => f.kind !== "SKILL");
  const findings: Finding[] = [];
  const noted: string[] = [];

  for (const { tool, kinds, path, reads, folder } of KNOWN_TOOLS) {
    if (kinds.some((kind) => present.has(kind))) continue;
    if (!hasAnyInstructionFile || dirExists(root, folder)) {
      findings.push({
        check: "no-file",
        file: path,
        line: 0,
        sentence: `No instruction file: ${tool} reads ${reads}, and this repository has none at the head commit.`,
      });
    } else {
      noted.push(tool);
    }
  }

  const notes: Note[] = [];
  if (noted.length > 0) {
    const list = noted.length === 1 ? noted[0] : `${noted.slice(0, -1).join(", ")} and ${noted[noted.length - 1]}`;
    notes.push({
      sentence: `No instruction file for ${list}. Not a finding: nothing here says ${noted.length === 1 ? "it is" : "they are"} in use.`,
    });
  }

  return { findings, notes };
}
