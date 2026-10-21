import { describe, expect, it } from "vitest";
import { buildComment, buildSuggestion, COMMENT_MARKER, suggestionMarker } from "../src/comment.js";
import type { Inventory, RunResult } from "../src/types.js";

function inventory(overrides: Partial<Inventory> = {}): Inventory {
  return {
    fileCount: 1,
    ruleCount: 3,
    toolCount: 1,
    tools: [{ kind: "AGENTS", label: "AGENTS.md", fileCount: 1 }],
    ownedRuleCount: 1,
    reviewedRuleCount: 0,
    ...overrides,
  };
}

describe("buildComment", () => {
  it("always ends with the fixed tagline and link", () => {
    const empty: RunResult = {
      findings: [],
      ruleCount: 3,
      fileCount: 1,
      inventory: inventory(),
      notes: [],
      instructionChanges: [],
      conclusion: "success",
    };
    const body = buildComment(empty);
    expect(body.trimEnd().endsWith(
      "Receipts for one repo. Ctrl Alt Delegate keeps them for all of yours.\n" +
      "[hertect.com/ctrl-alt-delegate](https://hertect.com/ctrl-alt-delegate)"
    )).toBe(true);
  });

  it("carries the sticky marker for comment upsert", () => {
    const empty: RunResult = {
      findings: [],
      ruleCount: 0,
      fileCount: 0,
      inventory: inventory({ fileCount: 0, ruleCount: 0, toolCount: 0, tools: [], ownedRuleCount: 0 }),
      notes: [],
      instructionChanges: [],
      conclusion: "success",
    };
    expect(buildComment(empty)).toContain(COMMENT_MARKER);
  });

  it("groups findings by check and includes file:line and what was looked for", () => {
    const result: RunResult = {
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ ruleCount: 1 }),
      notes: [],
      instructionChanges: [],
      conclusion: "failure",
      findings: [
        {
          check: "dead-command",
          file: "AGENTS.md",
          line: 7,
          sentence: "Dead command: `foo` — no package.json script, Makefile target, or CI workflow binary named `foo`.",
          lookedFor: "foo",
        },
      ],
    };
    const body = buildComment(result);
    expect(body).toContain("### Dead command (1)");
    expect(body).toContain("AGENTS.md:7");
    expect(body).toContain("looked for `foo`");
  });

  // The inventory is the reason this Action is worth running on a repository
  // that turns out to be clean, so a clean run must still say what exists.
  it("shows the inventory even when there are no findings", () => {
    const clean: RunResult = {
      findings: [],
      ruleCount: 41,
      fileCount: 6,
      inventory: inventory({
        fileCount: 6,
        ruleCount: 41,
        toolCount: 3,
        tools: [
          { kind: "AGENTS", label: "AGENTS.md", fileCount: 2 },
          { kind: "CURSOR_MDC", label: "Cursor rules", fileCount: 2 },
          { kind: "SKILL", label: "SKILL.md", fileCount: 2 },
        ],
        ownedRuleCount: 4,
        reviewedRuleCount: 12,
      }),
      notes: [],
      instructionChanges: [],
      conclusion: "success",
    };
    const body = buildComment(clean);
    expect(body).toContain("**6 instruction files · 3 tools · 41 rules**");
    expect(body).toContain("AGENTS.md ×2 · Cursor rules ×2 · SKILL.md ×2");
    expect(body).toContain("4 of 41 name an owner. 12 record a review date.");
    expect(body).toContain("No findings.");
  });

  it("puts the inventory above the findings", () => {
    const result: RunResult = {
      ruleCount: 2,
      fileCount: 1,
      inventory: inventory({ ruleCount: 2 }),
      notes: [],
      instructionChanges: [],
      conclusion: "failure",
      findings: [
        { check: "no-check", file: "AGENTS.md", line: 3, sentence: "No Check line." },
      ],
    };
    const body = buildComment(result);
    expect(body.indexOf("instruction file")).toBeLessThan(body.indexOf("### No Check line"));
  });

  it("singularises counts of one", () => {
    const one: RunResult = {
      findings: [],
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ fileCount: 1, ruleCount: 1, toolCount: 1 }),
      notes: [],
      instructionChanges: [],
      conclusion: "success",
    };
    expect(buildComment(one)).toContain("**1 instruction file · 1 tool · 1 rule**");
  });

  it("says so plainly when the repository has no instruction files", () => {
    const none: RunResult = {
      findings: [],
      ruleCount: 0,
      fileCount: 0,
      inventory: inventory({ fileCount: 0, ruleCount: 0, toolCount: 0, tools: [], ownedRuleCount: 0 }),
      notes: [],
      instructionChanges: [],
      conclusion: "success",
    };
    const body = buildComment(none);
    expect(body).toContain("No instruction or skill files found in this repository.");
    expect(body).not.toContain("name an owner");
  });

  it("prints a note under the inventory, above the findings", () => {
    const result: RunResult = {
      findings: [],
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ ruleCount: 1 }),
      notes: [{ sentence: "No instruction file for Gemini. Not a finding: nothing here says it is in use." }],
      instructionChanges: [],
      conclusion: "success",
    };
    const body = buildComment(result);
    expect(body.indexOf("No instruction file for Gemini.")).toBeGreaterThan(body.indexOf("name an owner"));
    expect(body.indexOf("No instruction file for Gemini.")).toBeLessThan(body.indexOf("No findings."));
  });

  // An instruction pull request changes what every agent on the repository is
  // told, so the comment says what changed in those terms, between the
  // inventory and the findings, and says nothing when no such file changed.
  it("explains the instruction files a pull request changed, above the findings", () => {
    const result: RunResult = {
      ruleCount: 3,
      fileCount: 2,
      inventory: inventory({ fileCount: 2, ruleCount: 3, toolCount: 2 }),
      notes: [],
      instructionChanges: [
        {
          path: ".cursor/rules/deploy.mdc",
          kind: "CURSOR_MDC",
          status: "added",
          readBy: ["Cursor"],
          appliesTo: "`src/**/*.ts`",
          added: ["deploy.mdc"],
          removed: [],
          edited: [],
          owners: [],
        },
        {
          path: "AGENTS.md",
          kind: "AGENTS",
          status: "modified",
          readBy: ["Codex", "Cursor", "Copilot"],
          appliesTo: "the whole repository",
          added: ["Scope boundaries"],
          removed: ["Testing"],
          edited: ["Scripts", "Standing rules"],
          owners: ["@hertect-ops"],
        },
        {
          path: "docs/GEMINI.md",
          previousPath: "GEMINI.md",
          kind: "GEMINI",
          status: "renamed",
          readBy: ["Gemini"],
          appliesTo: "`docs/`",
          added: [],
          removed: [],
          edited: [],
          owners: [],
        },
        {
          path: "old/AGENTS.md",
          kind: "AGENTS",
          status: "removed",
          readBy: ["Codex", "Cursor", "Copilot"],
          appliesTo: "`old/`",
          added: [],
          removed: ["Legacy"],
          edited: [],
          owners: [],
        },
      ],
      conclusion: "failure",
      findings: [{ check: "no-check", file: "AGENTS.md", line: 3, sentence: "No Check line." }],
    };
    const body = buildComment(result);
    expect(body).toContain("### Instruction files changed (4)");
    expect(body).toContain(
      "- `.cursor/rules/deploy.mdc` — added. Read by Cursor. Applies to `src/**/*.ts`. No Owner line.\n" +
        '  - Added: "deploy.mdc"\n' +
        "- `AGENTS.md` — modified. Read by Codex, Cursor and Copilot. Applies to the whole repository. Owner: `@hertect-ops`.\n" +
        '  - Added: "Scope boundaries"\n' +
        '  - Removed: "Testing"\n' +
        '  - Edited: "Scripts", "Standing rules"\n' +
        "- `docs/GEMINI.md` — renamed from `GEMINI.md`. Read by Gemini. Applies to `docs/`. No Owner line.\n" +
        "- `old/AGENTS.md` — removed. Read by Codex, Cursor and Copilot. Applies to `old/`.\n" +
        '  - Removed: "Legacy"\n',
    );
    expect(body.indexOf("### Instruction files changed")).toBeGreaterThan(body.indexOf("name an owner"));
    expect(body.indexOf("### Instruction files changed")).toBeLessThan(body.indexOf("### No Check line"));
  });

  it("has no instruction-change section when the pull request changed no instruction file", () => {
    const result: RunResult = {
      findings: [],
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ ruleCount: 1 }),
      notes: [],
      instructionChanges: [],
      conclusion: "success",
    };
    expect(buildComment(result)).not.toContain("Instruction files changed");
  });

  // A proposed fix is said either way, and the sentence says who proposed it
  // and who decides. Only a line in the pull request's diff can carry a
  // suggested change, so the other case says why none was posted.
  it("says what Ctrl Alt Delegate proposes for a finding, and whether it became a suggested change", () => {
    const result: RunResult = {
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ ruleCount: 1 }),
      notes: [],
      instructionChanges: [],
      conclusion: "failure",
      findings: [
        {
          check: "dead-path",
          file: "AGENTS.md",
          line: 10,
          sentence: "Dead path: `scripts/rotate-keys.sh` — `scripts/` exists but has no `rotate-keys.sh`.",
          lookedFor: "scripts/rotate-keys.sh",
          proposal: { from: "scripts/rotate-keys.sh", to: "tools/rotate-keys.sh", replacement: "- `tools/rotate-keys.sh` rotates keys.", suggested: true },
        },
        {
          check: "dead-command",
          file: "AGENTS.md",
          line: 13,
          sentence: "Dead command: `npm run typecheck` — package.json has no script named `typecheck`.",
          lookedFor: "typecheck",
          proposal: { from: "npm run typecheck", to: "npm run type-check", replacement: "- Run `npm run type-check`.", suggested: false },
        },
        {
          check: "dead-command",
          file: "AGENTS.md",
          line: 11,
          sentence: "Dead command: `npm run lint` — package.json has no script named `lint`.",
          lookedFor: "lint",
        },
      ],
    };
    const body = buildComment(result);
    expect(body).toContain(
      "- `AGENTS.md:10` — Dead path: `scripts/rotate-keys.sh` — `scripts/` exists but has no `rotate-keys.sh`. — looked for `scripts/rotate-keys.sh` " +
        "Ctrl Alt Delegate proposes `scripts/rotate-keys.sh` → `tools/rotate-keys.sh` as a suggested change on this line; a person decides.",
    );
    expect(body).toContain(
      "— looked for `typecheck` Ctrl Alt Delegate proposes `npm run typecheck` → `npm run type-check`; " +
        "this line is not in the pull request's diff, so no suggested change was posted.",
    );
    expect(body).toContain("— looked for `lint`\n");
  });

  it("builds a review comment holding the suggested change, keyed to its finding", () => {
    const finding = {
      check: "dead-path" as const,
      file: "AGENTS.md",
      line: 10,
      sentence: "Dead path: `scripts/rotate-keys.sh` — `scripts/` exists but has no `rotate-keys.sh`.",
      lookedFor: "scripts/rotate-keys.sh",
      proposal: { from: "scripts/rotate-keys.sh", to: "tools/rotate-keys.sh", replacement: "- `tools/rotate-keys.sh` rotates keys.", suggested: true },
    };
    expect(suggestionMarker(finding)).toBe("<!-- ctrl-alt-delegate-action:suggestion:AGENTS.md:10:scripts/rotate-keys.sh -->");
    expect(buildSuggestion(finding)).toBe(
      "<!-- ctrl-alt-delegate-action:suggestion:AGENTS.md:10:scripts/rotate-keys.sh -->\n" +
        "Dead path: `scripts/rotate-keys.sh` — `scripts/` exists but has no `rotate-keys.sh`. " +
        "Ctrl Alt Delegate proposes `scripts/rotate-keys.sh` → `tools/rotate-keys.sh`; a person decides.\n" +
        "\n" +
        "```suggestion\n" +
        "- `tools/rotate-keys.sh` rotates keys.\n" +
        "```",
    );
    expect(buildSuggestion({ ...finding, proposal: undefined })).toBe("");
  });

  it("names the file alone, with no line, for a finding about a file that does not exist", () => {
    const result: RunResult = {
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ ruleCount: 1 }),
      notes: [],
      instructionChanges: [],
      conclusion: "failure",
      findings: [
        {
          check: "no-file",
          file: "CLAUDE.md",
          line: 0,
          sentence: "No instruction file: Claude Code reads CLAUDE.md, and this repository has none at the head commit.",
        },
      ],
    };
    const body = buildComment(result);
    expect(body).toContain("### No instruction file (1)");
    expect(body).toContain("- `CLAUDE.md` — No instruction file:");
    expect(body).not.toContain("CLAUDE.md:0");
  });
});
