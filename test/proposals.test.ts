import { describe, expect, it } from "vitest";
import { linesInDiff, movedFile, nearMiss, proposeReplacement, renameInCommand } from "../src/proposals.js";
import type { ParsedRule } from "../src/types.js";

describe("nearMiss", () => {
  it("matches by case alone", () => {
    expect(nearMiss("Lint", ["lint", "build"])).toBe("lint");
    expect(nearMiss("lint", ["LINT"])).toBe("LINT");
  });

  it("matches by one hyphen or underscore inserted, removed, or swapped", () => {
    expect(nearMiss("typecheck", ["type-check", "build"])).toBe("type-check");
    expect(nearMiss("type-check", ["typecheck"])).toBe("typecheck");
    expect(nearMiss("deploy_staging", ["deploy-staging"])).toBe("deploy-staging");
    expect(nearMiss("type_check", ["typecheck"])).toBe("typecheck");
  });

  it("does not match a colon, two dashes, a different word, or the name itself", () => {
    expect(nearMiss("deploy:staging", ["deploy-staging"])).toBeUndefined();
    expect(nearMiss("type-check-all", ["typecheckall"])).toBeUndefined();
    expect(nearMiss("lint", ["lint-fix"])).toBeUndefined();
    expect(nearMiss("lint", ["lint"])).toBeUndefined();
    expect(nearMiss("Type-Check", ["typecheck"])).toBeUndefined();
  });

  it("is nothing when two defined names are each a near miss", () => {
    expect(nearMiss("typecheck", ["type-check", "Typecheck"])).toBeUndefined();
  });
});

describe("movedFile", () => {
  const files = ["tools/rotate-keys.sh", "scripts/backup.sh", "docs/a/README.md", "docs/b/README.md", "README.md"];

  it("is the one file in the repository with that basename", () => {
    expect(movedFile("scripts/rotate-keys.sh", files)).toBe("tools/rotate-keys.sh");
    expect(movedFile("./scripts/rotate-keys.sh", files)).toBe("tools/rotate-keys.sh");
  });

  it("is nothing when none or several files have that basename, or the token has no folder", () => {
    expect(movedFile("scripts/runbook.md", files)).toBeUndefined();
    expect(movedFile("packages/README.md", files)).toBeUndefined();
    expect(movedFile("CONTRIBUTING.md", files)).toBeUndefined();
  });
});

describe("renameInCommand", () => {
  it("replaces the script or target name and keeps the rest of the command", () => {
    expect(renameInCommand("npm run typecheck", "typecheck", "type-check")).toBe("npm run type-check");
    expect(renameInCommand("pnpm --filter web typecheck --watch", "typecheck", "type-check")).toBe("pnpm --filter web type-check --watch");
    expect(renameInCommand("make Deploy", "Deploy", "deploy")).toBe("make deploy");
  });
});

describe("proposeReplacement", () => {
  const rule: ParsedRule = {
    file: "AGENTS.md",
    kind: "AGENTS",
    shape: "heading",
    title: "Scripts",
    titleLine: 3,
    bodyText: "Scripts\n\n- Run `npm run typecheck` before pushing.\n- `scripts/a.sh` and `scripts/a.sh` again.",
    bodyStartLine: 3,
  };

  it("is the finding's line with the fix applied", () => {
    expect(proposeReplacement(rule, 5, "npm run typecheck", "npm run type-check")).toEqual({
      from: "npm run typecheck",
      to: "npm run type-check",
      replacement: "- Run `npm run type-check` before pushing.",
      suggested: false,
    });
  });

  it("is nothing when the line holds the text twice, not at all, or the fix changes nothing", () => {
    expect(proposeReplacement(rule, 6, "scripts/a.sh", "tools/a.sh")).toBeUndefined();
    expect(proposeReplacement(rule, 5, "npm run lint", "npm run Lint")).toBeUndefined();
    expect(proposeReplacement(rule, 5, "npm run typecheck", "npm run typecheck")).toBeUndefined();
  });
});

describe("linesInDiff", () => {
  it("is every context and added line of each hunk, by new line number, and none for a removed or patchless file", () => {
    const lines = linesInDiff([
      { path: "AGENTS.md", status: "modified", patch: "@@ -3,4 +3,4 @@ heading\n a\n-b\n+B\n c\n d\n@@ -20,2 +20,3 @@\n x\n+y\n z" },
      { path: "GEMINI.md", status: "removed", patch: "@@ -1 +0,0 @@\n-a" },
      { path: "big.md", status: "modified" },
    ]);
    expect([...(lines.get("AGENTS.md") ?? [])]).toEqual([3, 4, 5, 6, 20, 21, 22]);
    expect(lines.has("GEMINI.md")).toBe(false);
    expect(lines.has("big.md")).toBe(false);
  });
});
