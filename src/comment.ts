import type { CheckId, Finding, Inventory, RunResult } from "./types.js";

export const COMMENT_MARKER = "<!-- ctrl-alt-delegate-action:sticky-comment -->";

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

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatFindingLine(f: Finding): string {
  const lookedFor = f.lookedFor ? ` — looked for \`${f.lookedFor}\`` : "";
  const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
  return `- \`${where}\` — ${f.sentence}${lookedFor}`;
}
