import { extractBacktickedCommands, extractCuedCommands } from "../scan.js";
import type { ParsedRule } from "../types.js";

export interface ScannableField {
  text: string;
  line: number;
  field: "what" | "appliesTo" | "check";
}

/**
 * Fields eligible for checks 1 (dead command) and 2 (dead path): the
 * What/Applies to/Check lines of five-line-shape rules, and the derived
 * What-to-do/Check sections of a Skill. Heading-block rules have no such
 * fields — they are handled separately by check 3 only, per the brief.
 */
export interface BodyLine {
  text: string;
  line: number;
  /** True inside a fenced block whose info string is a shell (or empty): every line is a command. */
  shell: boolean;
}

const SHELL_FENCES = new Set(["", "sh", "bash", "shell", "zsh", "console", "shell-session"]);

/**
 * The lines of a heading-block rule with their 1-based file line numbers,
 * for the prose scans (scripts and targets, commands a sentence says to
 * run, paths, and the commands the contradiction check compares). Empty
 * for every other shape, whose fields come from scannableFields.
 */
export function headingBlockLines(rule: ParsedRule): BodyLine[] {
  if (rule.shape !== "heading") return [];
  // A block never starts inside a fence: the parser ignores fenced headings.
  let fence: string | undefined;
  return rule.bodyText.split(/\r?\n/).map((text, i) => {
    const delimiter = /^\s*(```|~~~)\s*([\w-]*)/.exec(text);
    if (delimiter) {
      fence = fence === undefined ? delimiter[2].toLowerCase() : undefined;
      return { text, line: rule.bodyStartLine + i, shell: false };
    }
    return { text, line: rule.bodyStartLine + i, shell: fence !== undefined && SHELL_FENCES.has(fence) };
  });
}

/**
 * The commands a prose line states: its backticked spans, or, inside a
 * shell fence, the line itself with a `$ ` prompt removed. Comments and
 * blank lines in a fence are nothing.
 */
export function commandsIn({ text, shell }: BodyLine): string[] {
  if (!shell) return extractBacktickedCommands(text);
  const cmd = text.trim().replace(/^\$\s+/, "");
  return cmd && !cmd.startsWith("#") ? [cmd] : [];
}

/** The commands a prose line says to run: everything in a shell fence, else only cued backticks. */
export function cuedCommandsIn({ text, shell }: BodyLine): string[] {
  return shell ? commandsIn({ text, shell, line: 0 }) : extractCuedCommands(text);
}

export function scannableFields(rule: ParsedRule): ScannableField[] {
  if (rule.shape === "heading") return [];
  const out: ScannableField[] = [];
  if (rule.whatText && rule.whatLine) out.push({ text: rule.whatText, line: rule.whatLine, field: "what" });
  if (rule.appliesToText && rule.appliesToLine) {
    out.push({ text: rule.appliesToText, line: rule.appliesToLine, field: "appliesTo" });
  }
  if (rule.checkText && rule.checkLine) out.push({ text: rule.checkText, line: rule.checkLine, field: "check" });
  return out;
}
