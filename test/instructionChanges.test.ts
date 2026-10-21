import { describe, expect, it } from "vitest";
import { explainInstructionChanges } from "../src/instructionChanges.js";
import type { ChangedFile, DiscoveredFile, FileKind } from "../src/types.js";

function file(path: string, kind: FileKind, content: string): DiscoveredFile {
  return { path, kind, content };
}

const AGENTS = [
  "# Notes",
  "",
  "## Rule: Keep tests green",
  "What: Run the tests.",
  "Check: `npm test` passes.",
  "Owner: @qa-lead",
  "",
  "## Rule: Keep docs current",
  "What: Update docs/ with every change.",
  "Check: visible in the PR.",
  "Owner: @docs-lead",
].join("\n");

describe("explainInstructionChanges", () => {
  it("lists only the files the Action reads, sorted by path", () => {
    const changed: ChangedFile[] = [
      { path: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
      { path: "README.md", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
      { path: "docs/AGENTS.md", status: "added", patch: "@@ -0,0 +1 @@\n+Keep it short." },
      { path: "CLAUDE.md", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ];
    const files = [file("docs/AGENTS.md", "AGENTS", "Keep it short."), file("CLAUDE.md", "CLAUDE", "b")];
    expect(explainInstructionChanges(changed, files).map((c) => c.path)).toEqual(["CLAUDE.md", "docs/AGENTS.md"]);
  });

  it("is empty when the pull request changed no instruction file", () => {
    const changed: ChangedFile[] = [{ path: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" }];
    expect(explainInstructionChanges(changed, [])).toEqual([]);
  });

  it("names the tools that read each kind", () => {
    const changed: ChangedFile[] = [
      { path: "AGENTS.md", status: "modified" },
      { path: "CLAUDE.md", status: "modified" },
      { path: ".github/copilot-instructions.md", status: "modified" },
      { path: ".cursor/rules/a.mdc", status: "modified" },
      { path: ".cursorrules", status: "modified" },
      { path: "GEMINI.md", status: "modified" },
      { path: "skills/x/SKILL.md", status: "modified" },
    ];
    const readBy = Object.fromEntries(explainInstructionChanges(changed, []).map((c) => [c.path, c.readBy]));
    expect(readBy).toEqual({
      "AGENTS.md": ["Codex", "Cursor", "Copilot"],
      "CLAUDE.md": ["Claude Code"],
      ".github/copilot-instructions.md": ["Copilot"],
      ".cursor/rules/a.mdc": ["Cursor"],
      ".cursorrules": ["Cursor"],
      "GEMINI.md": ["Gemini"],
      "skills/x/SKILL.md": ["Claude Code", "Codex"],
    });
  });

  it("says where each file applies: the repository, its folder, its globs, or when invoked", () => {
    const changed: ChangedFile[] = [
      { path: "AGENTS.md", status: "modified" },
      { path: "packages/web/CLAUDE.md", status: "modified" },
      { path: ".cursor/rules/ts.mdc", status: "modified" },
      { path: ".cursor/rules/always.mdc", status: "modified" },
      { path: ".cursor/rules/manual.mdc", status: "modified" },
      { path: "skills/release/SKILL.md", status: "modified" },
    ];
    const files = [
      file(".cursor/rules/ts.mdc", "CURSOR_MDC", "---\nglobs: src/**/*.ts\n---\nUse strict mode."),
      file(".cursor/rules/always.mdc", "CURSOR_MDC", "---\nalwaysApply: true\n---\nBe brief."),
      file(".cursor/rules/manual.mdc", "CURSOR_MDC", "---\nalwaysApply: false\n---\nBe brief."),
    ];
    const appliesTo = Object.fromEntries(explainInstructionChanges(changed, files).map((c) => [c.path, c.appliesTo]));
    expect(appliesTo).toEqual({
      "AGENTS.md": "the whole repository",
      "packages/web/CLAUDE.md": "`packages/web/`",
      ".cursor/rules/ts.mdc": "`src/**/*.ts`",
      ".cursor/rules/always.mdc": "the whole repository",
      ".cursor/rules/manual.mdc": "when Cursor attaches the rule",
      "skills/release/SKILL.md": "when the skill is invoked (`skills/release/`)",
    });
  });

  it("names the rules a diff adds, removes and edits, by heading", () => {
    const patch = [
      "@@ -3,9 +3,9 @@",
      " ## Rule: Keep tests green",
      "-What: Run the tests before pushing.",
      "+What: Run the tests.",
      " Check: `npm test` passes.",
      " Owner: @qa-lead",
      " ",
      "-## Rule: Lint on save",
      "-What: Keep the linter on.",
      "+## Rule: Keep docs current",
      "+What: Update docs/ with every change.",
      " Check: visible in the PR.",
      " Owner: @docs-lead",
    ].join("\n");
    const [change] = explainInstructionChanges([{ path: "AGENTS.md", status: "modified", patch }], [file("AGENTS.md", "AGENTS", AGENTS)]);
    expect(change.added).toEqual(["Keep docs current"]);
    expect(change.removed).toEqual(["Lint on save"]);
    expect(change.edited).toEqual(["Keep tests green"]);
  });

  it("reads a heading removed and added again as one rule edited, and a blank line moved as nothing", () => {
    const patch = ["@@ -8,2 +8,3 @@", "-## Rule: Keep docs current", "+", "+## Rule: Keep docs current", " What: Update docs/ with every change."].join("\n");
    const [change] = explainInstructionChanges([{ path: "AGENTS.md", status: "modified", patch }], [file("AGENTS.md", "AGENTS", AGENTS)]);
    expect(change).toMatchObject({ added: [], removed: [], edited: ["Keep docs current"] });
  });

  it("reports every rule of a new file as added, including prose with no heading", () => {
    const patch = "@@ -0,0 +1,3 @@\n+Read AGENTS.md first.\n+\n+## Deploy\n+Run `make deploy`.";
    const content = "Read AGENTS.md first.\n\n## Deploy\nRun `make deploy`.";
    const [change] = explainInstructionChanges([{ path: "GEMINI.md", status: "added", patch }], [file("GEMINI.md", "GEMINI", content)]);
    expect(change).toMatchObject({ status: "added", added: ["GEMINI.md", "Deploy"], removed: [], edited: [] });
  });

  it("reports the headings of a removed file from its diff alone", () => {
    const patch = "@@ -1,3 +0,0 @@\n-# Notes\n-## Deploy\n-Run `make deploy`.";
    const [change] = explainInstructionChanges([{ path: "GEMINI.md", status: "removed", patch }], []);
    expect(change).toMatchObject({ status: "removed", added: [], removed: ["Deploy"], edited: [], owners: [] });
  });

  it("carries a rename's previous path", () => {
    const [change] = explainInstructionChanges(
      [{ path: "docs/AGENTS.md", status: "renamed", previousPath: "AGENTS.md" }],
      [file("docs/AGENTS.md", "AGENTS", "Keep it short.")],
    );
    expect(change.previousPath).toBe("AGENTS.md");
    expect(change.appliesTo).toBe("`docs/`");
  });

  it("reads the file's Owner lines verbatim, distinct, in order, and none when it has none", () => {
    const changed: ChangedFile[] = [
      { path: "AGENTS.md", status: "modified" },
      { path: "CLAUDE.md", status: "modified" },
    ];
    const files = [file("AGENTS.md", "AGENTS", AGENTS + "\n\n## Rule: Third\nOwner: @qa-lead"), file("CLAUDE.md", "CLAUDE", "Read AGENTS.md.")];
    const owners = Object.fromEntries(explainInstructionChanges(changed, files).map((c) => [c.path, c.owners]));
    expect(owners).toEqual({ "AGENTS.md": ["@qa-lead", "@docs-lead"], "CLAUDE.md": [] });
  });

  it("gives no rule detail when the API sent no patch", () => {
    const [change] = explainInstructionChanges([{ path: "AGENTS.md", status: "modified" }], [file("AGENTS.md", "AGENTS", AGENTS)]);
    expect(change).toMatchObject({ added: [], removed: [], edited: [] });
  });
});
