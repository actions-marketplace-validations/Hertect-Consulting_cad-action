import { describe, expect, it } from "vitest";
import { buildInventory } from "../src/inventory.js";
import type { DiscoveredFile, FileKind, ParsedRule } from "../src/types.js";

function file(path: string, kind: FileKind): DiscoveredFile {
  return { path, kind, content: "" };
}

function rule(overrides: Partial<ParsedRule> = {}): ParsedRule {
  return {
    file: "AGENTS.md",
    kind: "AGENTS",
    shape: "five-line",
    title: "A rule",
    titleLine: 1,
    bodyText: "",
    bodyStartLine: 1,
    ...overrides,
  };
}

describe("buildInventory", () => {
  it("counts files, rules and distinct tools", () => {
    const inv = buildInventory(
      [file("AGENTS.md", "AGENTS"), file("docs/AGENTS.md", "AGENTS"), file("CLAUDE.md", "CLAUDE")],
      [rule(), rule(), rule()],
    );
    expect(inv.fileCount).toBe(3);
    expect(inv.ruleCount).toBe(3);
    expect(inv.toolCount).toBe(2);
  });

  it("groups files by tool with a stable order regardless of discovery order", () => {
    const inv = buildInventory(
      [file("x/SKILL.md", "SKILL"), file("CLAUDE.md", "CLAUDE"), file("AGENTS.md", "AGENTS")],
      [],
    );
    expect(inv.tools.map((t) => t.label)).toEqual(["AGENTS.md", "CLAUDE.md", "SKILL.md"]);
  });

  it("counts an owner only when the line carries a value", () => {
    const inv = buildInventory(
      [file("AGENTS.md", "AGENTS")],
      [rule({ owner: "@heather" }), rule({ owner: "   " }), rule({ owner: undefined })],
    );
    expect(inv.ownedRuleCount).toBe(1);
  });

  // Whether a review is still valid needs history this Action does not keep, so
  // the count must mean "records a date" and nothing stronger.
  it("counts a review date as recorded, without judging whether it is current", () => {
    const inv = buildInventory(
      [file("AGENTS.md", "AGENTS")],
      [rule({ reviewed: "2019-01-01" }), rule({ reviewed: undefined })],
    );
    expect(inv.reviewedRuleCount).toBe(1);
  });

  it("returns an empty inventory for a repository with nothing to read", () => {
    const inv = buildInventory([], []);
    expect(inv).toEqual({
      fileCount: 0,
      ruleCount: 0,
      toolCount: 0,
      tools: [],
      ownedRuleCount: 0,
      reviewedRuleCount: 0,
    });
  });
});

// The bug this pairs with lives in the parser, which never filled owner or reviewed for a
// heading-shaped rule. The count below was always shape-independent, so the two disagreed
// and the comment said "0 of 8 name an owner" about a file where all eight did.
describe("counting ownership on a file that uses plain headings", () => {
  it("counts a heading-shaped rule that names an owner and a review date", () => {
    const inv = buildInventory(
      [file("AGENTS.md", "AGENTS")],
      [
        rule({ shape: "heading", owner: "@heathergearreald", reviewed: "2026-09-25" }),
        rule({ shape: "heading", owner: "@heathergearreald", reviewed: "2026-09-25" }),
        rule({ shape: "heading" }),
      ],
    );
    expect(inv.ruleCount).toBe(3);
    expect(inv.ownedRuleCount).toBe(2);
    expect(inv.reviewedRuleCount).toBe(2);
  });
});
