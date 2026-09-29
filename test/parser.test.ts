import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverFiles } from "../src/discovery.js";
import { parseFile, parseFiles } from "../src/parser.js";
import type { DiscoveredFile, FileKind } from "../src/types.js";

const ROOT = join(import.meta.dirname, "..");
const FIXTURES = join(ROOT, "test", "fixtures");

describe("parseFile — the five file kinds", () => {
  it("parses AGENTS.md, CLAUDE.md, copilot-instructions.md, cursor .mdc, and SKILL.md without throwing, each yielding at least one rule", () => {
    const files = discoverFiles(join(FIXTURES, "discovery-kinds"));
    const kinds: FileKind[] = ["AGENTS", "CLAUDE", "COPILOT", "CURSOR_MDC", "SKILL"];
    for (const kind of kinds) {
      const file = files.find((f) => f.kind === kind);
      expect(file, `missing fixture for ${kind}`).toBeDefined();
      const rules = parseFile(file!);
      expect(rules.length, `${kind} produced no rules`).toBeGreaterThan(0);
    }
  });

  it("treats a SKILL.md as exactly one rule regardless of its internal headings", () => {
    const files = discoverFiles(join(FIXTURES, "discovery-kinds"));
    const skill = files.find((f) => f.kind === "SKILL")!;
    const rules = parseFile(skill);
    expect(rules).toHaveLength(1);
    expect(rules[0].shape).toBe("skill");
    expect(rules[0].checkText).toContain("npm run migrate:status");
  });

  it("parses a heading-block file (no five-line shape) into one rule per top-level heading", () => {
    const file: DiscoveredFile = {
      path: "GEMINI.md",
      kind: "GEMINI",
      content: "# GEMINI.md\n\n## First heading\n`git blame` here.\n\n## Second heading\nJust prose.\n",
    };
    const rules = parseFile(file);
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.shape === "heading")).toBe(true);
  });

  // The inventory counts owned and reviewed rules without looking at the shape, so a file
  // that uses plain headings was reported as "0 of N name an owner" however many Owner
  // lines it carried. Ctrl Alt Delegate's own AGENTS.md was the first repository to say so.
  it("reads Owner and Reviewed out of a heading block", () => {
    const file: DiscoveredFile = {
      path: "AGENTS.md",
      kind: "AGENTS",
      content: [
        "# Agent instructions",
        "",
        "## Process",
        "",
        "Owner: @heathergearreald",
        "Reviewed: 2026-09-25",
        "",
        "Read the build rules before any work.",
        "",
        "## Unowned",
        "",
        "Nothing here names anyone.",
        "",
      ].join("\n"),
    };
    const rules = parseFile(file);
    expect(rules).toHaveLength(2);
    expect(rules[0].shape).toBe("heading");
    expect(rules[0].owner).toBe("@heathergearreald");
    expect(rules[0].reviewed).toBe("2026-09-25");
    // The section that names nobody still names nobody.
    expect(rules[1].owner).toBeUndefined();
    expect(rules[1].reviewed).toBeUndefined();
  });

  // What, Applies to and Check stay out: `scannableFields` returns nothing for a heading
  // block, and check 3 reads its whole body instead. Reading them here would quietly
  // change which rules checks 1 and 2 scan.
  it("does not take the other three five-line fields out of a heading block", () => {
    const file: DiscoveredFile = {
      path: "AGENTS.md",
      kind: "AGENTS",
      content: [
        "# Agent instructions",
        "",
        "## Deploys",
        "",
        "What: ship it",
        "Applies to: everywhere",
        "Check: `npm run deploy`",
        "Owner: @heathergearreald",
        "",
      ].join("\n"),
    };
    const [rule] = parseFile(file);
    expect(rule.shape).toBe("heading");
    expect(rule.owner).toBe("@heathergearreald");
    expect(rule.whatText).toBeUndefined();
    expect(rule.appliesToText).toBeUndefined();
    expect(rule.checkText).toBeUndefined();
  });

  // The fence mask already protects the five-line shape; ownership must not be an exception.
  it("ignores an Owner line shown inside a code fence", () => {
    const file: DiscoveredFile = {
      path: "AGENTS.md",
      kind: "AGENTS",
      content: [
        "# Agent instructions",
        "",
        "## How to write a rule",
        "",
        "Copy this shape:",
        "",
        "```",
        "Owner: @someone",
        "Reviewed: 2026-01-01",
        "```",
        "",
      ].join("\n"),
    };
    const [rule] = parseFile(file);
    expect(rule.owner).toBeUndefined();
    expect(rule.reviewed).toBeUndefined();
  });

  it("only extracts `## Rule:` blocks from a file that uses the five-line shape, ignoring other headings", () => {
    const file: DiscoveredFile = {
      path: "AGENTS.md",
      kind: "AGENTS",
      content: [
        "# AGENTS.md",
        "",
        "## Rule: Example",
        "What: Do a thing.",
        "Applies to: **/*",
        "Check: `git status` is clean.",
        "Owner: @example",
        "Reviewed: 2026-09-16",
        "",
        "## Current run",
        "Not a rule, just a status block.",
      ].join("\n"),
    };
    const rules = parseFile(file);
    expect(rules).toHaveLength(1);
    expect(rules[0].title).toBe("Example");
  });
});

describe("parseFile — fenced example blocks are not parsed as real rules", () => {
  it("ignores a `## Rule:` heading and What/Check lines shown inside a code fence", () => {
    const file: DiscoveredFile = {
      path: "AGENTS.md",
      kind: "AGENTS",
      content: [
        "# AGENTS.md",
        "",
        "## Rule: Real rule",
        "What: A real thing.",
        "Applies to: **/*",
        "Check: `npm test` passes.",
        "Owner: @example",
        "Reviewed: 2026-09-16",
        "",
        "Copy this blank shape for a new rule:",
        "",
        "```",
        "## Rule: <name>",
        "What: ",
        "Applies to: ",
        "Check: ",
        "Owner: ",
        "Reviewed: ",
        "```",
      ].join("\n"),
    };
    const rules = parseFile(file);
    expect(rules).toHaveLength(1);
    expect(rules[0].title).toBe("Real rule");
    expect(rules[0].checkText).toBe("`npm test` passes.");
  });
});

describe("parseFile — the five published templates", () => {
  const templateDir = join(ROOT, "templates");
  const cases: { file: string; kind: FileKind; minRules: number }[] = [
    { file: "AGENTS.md", kind: "AGENTS", minRules: 1 },
    { file: "CLAUDE.md", kind: "CLAUDE", minRules: 1 },
    { file: "copilot-instructions.md", kind: "COPILOT", minRules: 1 },
    { file: "cursor-rule.mdc", kind: "CURSOR_MDC", minRules: 1 },
    { file: "SKILL.md", kind: "SKILL", minRules: 1 },
  ];

  for (const { file, kind, minRules } of cases) {
    it(`parses templates/${file} without throwing`, () => {
      const content = readFileSync(join(templateDir, file), "utf8");
      const rules = parseFile({ path: file, kind, content });
      expect(rules.length).toBeGreaterThanOrEqual(minRules);
    });
  }
});

describe("parseFiles", () => {
  it("flattens rules across every discovered file", () => {
    const files = discoverFiles(join(FIXTURES, "discovery-kinds"));
    const rules = parseFiles(files);
    expect(rules.length).toBeGreaterThanOrEqual(files.length);
  });
});
