import { checkContradiction } from "./checks/contradiction.js";
import { checkDeadCommand } from "./checks/deadCommand.js";
import { checkDeadPath } from "./checks/deadPath.js";
import { checkNoCheckLine } from "./checks/noCheck.js";
import { checkNoInstructionFile } from "./checks/noFile.js";
import { discoverFiles } from "./discovery.js";
import { explainInstructionChanges } from "./instructionChanges.js";
import { buildInventory } from "./inventory.js";
import { parseFiles } from "./parser.js";
import { markSuggested } from "./proposals.js";
import type { Finding, RunOptions, RunResult } from "./types.js";

export function run(options: RunOptions): RunResult {
  const files = discoverFiles(options.root, { extraPaths: options.extraPaths });
  const rules = parseFiles(files);

  const noFile = checkNoInstructionFile(options.root, files);
  const findings: Finding[] = [
    ...checkDeadCommand(options.root, rules, options.extraAllowCommands),
    ...checkDeadPath(options.root, rules),
    ...checkNoCheckLine(rules),
    ...noFile.findings,
    ...checkContradiction(rules),
  ];

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  markSuggested(findings, options.changedFiles ?? []);

  const gating =
    options.failOn === "none"
      ? []
      : options.failOn === "dead-only"
        ? findings.filter((f) => f.check === "dead-command" || f.check === "dead-path")
        : findings;

  return {
    findings,
    ruleCount: rules.length,
    fileCount: files.length,
    inventory: buildInventory(files, rules),
    notes: noFile.notes,
    instructionChanges: explainInstructionChanges(options.changedFiles ?? [], files),
    conclusion: gating.length > 0 ? "failure" : "success",
  };
}
