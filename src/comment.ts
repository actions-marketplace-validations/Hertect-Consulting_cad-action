import type { CheckId, Finding, InstructionChange, Inventory, RunResult } from "./types.js";

export const COMMENT_MARKER = "<!-- ctrl-alt-delegate-action:sticky-comment -->";

/** The marker that keys one suggested change to its finding, so a rerun updates it rather than posting it again. */
export function suggestionMarker(f: Finding): string {
  return `<!-- ctrl-alt-delegate-action:suggestion:${f.file}:${f.line}:${f.lookedFor ?? ""} -->`;
}

/**
 * The body of the review comment that carries a suggested change: the
 * finding, who proposed the fix, and the fix in the fenced block GitHub
 * turns into an "Add suggestion" button. The decision is the reader's.
 */
export function buildSuggestion(f: Finding): string {
  if (!f.proposal) return "";
  return [
    suggestionMarker(f),
    `${f.sentence} Ctrl Alt Delegate proposes \`${f.proposal.from}\` → \`${f.proposal.to}\`; a person decides.`,
    "",
    "```suggestion",
    f.proposal.replacement,
    "```",
  ].join("\n");
}

const CHECK_ORDER: CheckId[] = ["dead-command", "dead-path", "no-check", "no-file", "contradiction"];
const CHECK_LABEL: Record<CheckId, string> = {
  "dead-command": "Dead command",
  "dead-path": "Dead path",
  "no-check": "No Check line",
  "no-file": "No instruction file",
  contradiction: "Contradiction",
};

const TAGLINE = "Receipts for one repo. Ctrl Alt Delegate keeps them for all of yours.";
const TAGLINE_LINK = "[hertect.com/ctrl-alt-delegate](https://hertect.com/ctrl-alt-delegate)";

export function buildComment(result: RunResult): string {
  const lines: string[] = [COMMENT_MARKER, "## Ctrl Alt Delegate", ""];

  lines.push(...inventoryLines(result.inventory));
  for (const note of result.notes) lines.push(note.sentence, "");
  lines.push(...instructionChangeLines(result.instructionChanges));

  if (result.findings.length === 0) {
    lines.push("No findings.", "");
  } else {
    for (const check of CHECK_ORDER) {
      const items = result.findings.filter((f) => f.check === check);
      if (items.length === 0) continue;
      lines.push(`### ${CHECK_LABEL[check]} (${items.length})`, "");
      for (const f of items) {
        lines.push(formatFindingLine(f));
      }
      lines.push("");
    }
  }

  lines.push(TAGLINE);
  lines.push(TAGLINE_LINK);
  return lines.join("\n");
}

/**
 * What exists, before what is wrong with it. A reader who runs this on a clean
 * repository still sees something: the shape of their own instruction layer,
 * which is what the full product keeps across every repository rather than one.
 */
function inventoryLines(inventory: Inventory): string[] {
  if (inventory.fileCount === 0) {
    return ["No instruction or skill files found in this repository.", ""];
  }

  const headline = [
    plural(inventory.fileCount, "instruction file"),
    plural(inventory.toolCount, "tool"),
    plural(inventory.ruleCount, "rule"),
  ].join(" · ");

  const tools = inventory.tools
    .map((t) => (t.fileCount > 1 ? `${t.label} ×${t.fileCount}` : t.label))
    .join(" · ");

  const lines = [`**${headline}**`, "", tools, ""];

  if (inventory.ruleCount > 0) {
    lines.push(
      `${inventory.ownedRuleCount} of ${inventory.ruleCount} name an owner. ` +
        `${inventory.reviewedRuleCount} record a review date.`,
      "",
    );
  }

  return lines;
}

/**
 * A pull request that changes an instruction file changes what every agent
 * on the repository is told, so the comment says what changed in those
 * terms: who reads the file, where it applies, which rules moved, and whose
 * it is. A pull request that changes no instruction file gets no section.
 */
function instructionChangeLines(changes: InstructionChange[]): string[] {
  if (changes.length === 0) return [];
  const lines = [`### Instruction files changed (${changes.length})`, ""];
  for (const c of changes) {
    const status = c.status === "renamed" && c.previousPath ? `renamed from \`${c.previousPath}\`` : c.status;
    const owner =
      c.owners.length === 0
        ? c.status === "removed"
          ? ""
          : " No Owner line."
        : ` Owner: ${c.owners.map((o) => `\`${o}\``).join(", ")}.`;
    lines.push(`- \`${c.path}\` — ${status}. Read by ${list(c.readBy)}. Applies to ${c.appliesTo}.${owner}`);
    if (c.added.length > 0) lines.push(`  - Added: ${c.added.map(quote).join(", ")}`);
    if (c.removed.length > 0) lines.push(`  - Removed: ${c.removed.map(quote).join(", ")}`);
    if (c.edited.length > 0) lines.push(`  - Edited: ${c.edited.map(quote).join(", ")}`);
  }
  lines.push("");
  return lines;
}

function list(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function quote(title: string): string {
  return `"${title}"`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatFindingLine(f: Finding): string {
  const lookedFor = f.lookedFor ? ` — looked for \`${f.lookedFor}\`` : "";
  const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
  return `- \`${where}\` — ${f.sentence}${lookedFor}${proposalText(f)}`;
}

/**
 * A proposed fix is said in the comment whether or not it could be posted
 * as a suggested change, which GitHub allows only on a line in the pull
 * request's diff. Either way it is a proposal: Ctrl Alt Delegate made it
 * and a person decides.
 */
function proposalText(f: Finding): string {
  if (!f.proposal) return "";
  const fix = `\`${f.proposal.from}\` → \`${f.proposal.to}\``;
  return f.proposal.suggested
    ? ` Ctrl Alt Delegate proposes ${fix} as a suggested change on this line; a person decides.`
    : ` Ctrl Alt Delegate proposes ${fix}; this line is not in the pull request's diff, so no suggested change was posted.`;
}
