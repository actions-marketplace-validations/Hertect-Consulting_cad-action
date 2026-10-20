import { describe, expect, it } from "vitest";
import { buildComment, COMMENT_MARKER } from "../src/comment.js";
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
      conclusion: "success",
    };
    const body = buildComment(result);
    expect(body.indexOf("No instruction file for Gemini.")).toBeGreaterThan(body.indexOf("name an owner"));
    expect(body.indexOf("No instruction file for Gemini.")).toBeLessThan(body.indexOf("No findings."));
  });

  it("names the file alone, with no line, for a finding about a file that does not exist", () => {
    const result: RunResult = {
      ruleCount: 1,
      fileCount: 1,
      inventory: inventory({ ruleCount: 1 }),
      notes: [],
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
