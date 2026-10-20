import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import type { CheckId } from "../src/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

function findingsFor(fixture: string) {
  return run({
    root: join(FIXTURES, fixture),
    extraPaths: [],
    failOn: "all",
    extraAllowCommands: [],
  }).findings;
}

function byCheck(findings: { check: CheckId }[], check: CheckId) {
  return findings.filter((f) => f.check === check);
}

const ALL_FIXTURES = [
  "clean",
  "dead-command",
  "dead-path",
  "no-check",
  "contradiction-command",
  "contradiction-version",
  "dead-script",
  "dead-path-prose",
  "dead-command-prose",
  "no-file",
  "no-file-in-use",
  "no-file-none",
  "hertect-tools",
];

function resultFor(fixture: string) {
  return run({ root: join(FIXTURES, fixture), extraPaths: [], failOn: "all", extraAllowCommands: [] });
}

describe("clean fixture", () => {
  it("has zero findings and a success conclusion", () => {
    const result = run({
      root: join(FIXTURES, "clean"),
      extraPaths: [],
      failOn: "all",
      extraAllowCommands: [],
    });
    expect(result.findings).toEqual([]);
    expect(result.conclusion).toBe("success");
  });
});

describe("check 1 — dead command", () => {
  it("fires on the dead-command fixture", () => {
    const findings = byCheck(findingsFor("dead-command"), "dead-command");
    expect(findings).toHaveLength(1);
    expect(findings[0].lookedFor).toBe("verify-instructions-for-real");
  });

  it("stays silent on the clean fixture", () => {
    expect(byCheck(findingsFor("clean"), "dead-command")).toEqual([]);
  });

  it("fires when a five-line Check runs a package.json script that does not exist", () => {
    const findings = byCheck(findingsFor("dead-script"), "dead-command").filter((f) => f.file === "AGENTS.md");
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(6);
    expect(findings[0].lookedFor).toBe("lint");
    expect(findings[0].sentence).toBe("Dead command: `npm run lint` — package.json has no script named `lint`.");
  });

  it("fires when a heading-block sentence runs a package.json script that does not exist", () => {
    const findings = byCheck(findingsFor("dead-script"), "dead-command").filter((f) => f.file === "GEMINI.md");
    expect(findings).toHaveLength(2);
    expect(findings[0].line).toBe(4);
    expect(findings[0].lookedFor).toBe("deploy:staging");
  });

  it("resolves a workspace-scoped script against every package.json in the repository", () => {
    const findings = byCheck(findingsFor("dead-script"), "dead-command").filter((f) => f.line === 7);
    expect(findings).toHaveLength(1);
    expect(findings[0].sentence).toBe(
      "Dead command: `pnpm --filter web lint` — no package.json in the repository has a script named `lint`.",
    );
  });

  it("stays silent on scripts that exist, including npm test, pnpm run, and the three workspace forms", () => {
    const findings = byCheck(findingsFor("dead-script"), "dead-command");
    expect(findings.map((f) => f.lookedFor).sort()).toEqual(["deploy:staging", "lint", "lint"]);
  });

  it("does not treat every backticked word in a heading block as a command", () => {
    expect(byCheck(findingsFor("dead-path-prose"), "dead-command")).toEqual([]);
  });

  it("fires when a heading-block sentence says to run a binary nothing defines", () => {
    const findings = byCheck(findingsFor("dead-command-prose"), "dead-command").filter((f) => f.line === 5);
    expect(findings).toHaveLength(1);
    expect(findings[0].lookedFor).toBe("buildit");
    expect(findings[0].sentence).toBe(
      "Dead command: `buildit` — no package.json script, Makefile target, or CI workflow binary named `buildit`.",
    );
  });

  it("fires on a bare `pnpm <script>` whose script is not in package.json", () => {
    const findings = byCheck(findingsFor("dead-command-prose"), "dead-command").filter((f) => f.line === 12);
    expect(findings).toHaveLength(1);
    expect(findings[0].sentence).toBe("Dead command: `pnpm typecheck` — package.json has no script named `typecheck`.");
  });

  it("fires on a `make <target>` whose target is not in the Makefile", () => {
    const findings = byCheck(findingsFor("dead-command-prose"), "dead-command").filter((f) => f.line === 13);
    expect(findings).toHaveLength(1);
    expect(findings[0].lookedFor).toBe("deploy");
    expect(findings[0].sentence).toBe("Dead command: `make deploy` — no Makefile target named `deploy`.");
  });

  it("reads every line of a shell fence as a command, skipping prompts and comments, and no line of a json fence", () => {
    const findings = byCheck(findingsFor("dead-command-prose"), "dead-command").filter((f) => f.line > 15);
    expect(findings.map((f) => `${f.line}:${f.lookedFor}`)).toEqual(["19:lint", "21:release"]);
  });

  it("stays silent on allowed tools, installed dependencies, existing scripts and targets, chained commands, paths, and uncued spans", () => {
    const findings = byCheck(findingsFor("dead-command-prose"), "dead-command");
    expect(findings.map((f) => f.lookedFor).sort()).toEqual(["buildit", "deploy", "lint", "release", "typecheck"]);
  });
});

describe("check 2 — dead path", () => {
  it("fires on the dead-path fixture", () => {
    const findings = byCheck(findingsFor("dead-path"), "dead-path");
    expect(findings).toHaveLength(1);
    expect(findings[0].lookedFor).toBe("docs/style-guide.md");
  });

  it("stays silent on the clean fixture", () => {
    expect(byCheck(findingsFor("clean"), "dead-path")).toEqual([]);
  });

  it("fires in a heading block when the folder exists and the file does not", () => {
    const findings = byCheck(findingsFor("dead-path-prose"), "dead-path").filter((f) => f.line === 5);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("AGENTS.md");
    expect(findings[0].lookedFor).toBe("scripts/rotate-keys.sh");
    expect(findings[0].sentence).toBe("Dead path: `scripts/rotate-keys.sh` — `scripts/` exists but has no `rotate-keys.sh`.");
  });

  it("fires in a heading block on a missing path, a missing bare file name, and an empty glob", () => {
    const findings = byCheck(findingsFor("dead-path-prose"), "dead-path").filter((f) => f.line > 5);
    expect(findings.map((f) => `${f.line}:${f.lookedFor}`)).toEqual([
      "10:docs/runbook.md",
      "10:CONTRIBUTING.md",
      "11:src/**/*.test.ts",
    ]);
    expect(findings[0].sentence).toBe("Dead path: `docs/runbook.md` does not exist at the head commit.");
    expect(findings[1].sentence).toBe("Dead path: `CONTRIBUTING.md` does not exist at the head commit.");
    expect(findings[2].sentence).toBe("Dead path: `src/**/*.test.ts` matches no files at the head commit.");
  });

  it("leaves git refs, media types, framework names, dotfiles, nested files, root globs, branch globs, dot directories, node_modules and gitignored paths alone in a heading block", () => {
    const findings = byCheck(findingsFor("dead-path-prose"), "dead-path");
    expect(findings).toHaveLength(4);
  });
});

describe("check 3 — no Check line", () => {
  it("fires on both the five-line and heading-block cases in the no-check fixture", () => {
    const findings = byCheck(findingsFor("no-check"), "no-check");
    expect(findings).toHaveLength(2);
    expect(findings.some((f) => f.file === "AGENTS.md")).toBe(true);
    expect(findings.some((f) => f.file === "GEMINI.md")).toBe(true);
  });

  it("stays silent on the clean fixture", () => {
    expect(byCheck(findingsFor("clean"), "no-check")).toEqual([]);
  });
});

describe("check 5 — no instruction file", () => {
  it("is a note, not a finding, when the repository has files for other tools and nothing says the missing one is in use", () => {
    const result = resultFor("no-file");
    expect(byCheck(result.findings, "no-file")).toEqual([]);
    expect(result.notes.map((n) => n.sentence)).toEqual([
      "No instruction file for Claude Code, Cursor, Copilot and Gemini. Not a finding: nothing here says they are in use.",
    ]);
    expect(result.conclusion).toBe("success");
  });

  it("is a finding when the tool's own folder is present without its file", () => {
    const result = resultFor("no-file-in-use");
    const findings = byCheck(result.findings, "no-file");
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("CLAUDE.md");
    expect(findings[0].line).toBe(0);
    expect(findings[0].sentence).toBe(
      "No instruction file: Claude Code reads CLAUDE.md, and this repository has none at the head commit.",
    );
    expect(result.notes[0].sentence).toBe(
      "No instruction file for Cursor, Copilot and Gemini. Not a finding: nothing here says they are in use.",
    );
    expect(result.conclusion).toBe("failure");
  });

  it("is a finding for every known tool when the repository has no instruction file at all", () => {
    const result = resultFor("no-file-none");
    expect(byCheck(result.findings, "no-file").map((f) => f.file)).toEqual([
      ".cursor/rules",
      ".github/copilot-instructions.md",
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
    ]);
    expect(result.notes).toEqual([]);
  });

  it("stays silent, with no note, when every known tool has a file", () => {
    for (const fixture of ["clean", "discovery-kinds"]) {
      const result = resultFor(fixture);
      expect(byCheck(result.findings, "no-file"), fixture).toEqual([]);
      expect(result.notes, fixture).toEqual([]);
    }
  });

  it("never gates under dead-only", () => {
    const dead = run({ root: join(FIXTURES, "no-file-in-use"), extraPaths: [], failOn: "dead-only", extraAllowCommands: [] });
    expect(dead.conclusion).toBe("success");
  });
});

describe("check 4 — contradiction, narrow", () => {
  it("fires on the command-contradiction fixture", () => {
    const findings = byCheck(findingsFor("contradiction-command"), "contradiction");
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.file === "AGENTS.md")).toBe(true);
    expect(findings.some((f) => f.file === "GEMINI.md")).toBe(true);
  });

  it("fires on the version-contradiction fixture", () => {
    const findings = byCheck(findingsFor("contradiction-version"), "contradiction");
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings.some((f) => f.file === "AGENTS.md")).toBe(true);
    expect(findings.some((f) => f.file === ".github/copilot-instructions.md")).toBe(true);
  });

  it("fires when two files state the deploy script two ways in prose", () => {
    const findings = byCheck(findingsFor("hertect-tools"), "contradiction");
    expect(findings.map((f) => `${f.file}:${f.line}`)).toEqual([".cursor/rules/deploy.mdc:6", "AGENTS.md:12"]);
    expect(findings[1].sentence).toBe(
      "Contradiction: the deploy command here is `npm run deploy:staging`, but `npm run deploy` (.cursor/rules/deploy.mdc) says otherwise.",
    );
  });

  it("fires on the two contradiction fixtures and the hertect-tools fixture only", () => {
    const others = ALL_FIXTURES.filter((f) => !f.startsWith("contradiction") && f !== "hertect-tools");
    for (const fixture of others) {
      expect(byCheck(findingsFor(fixture), "contradiction"), fixture).toEqual([]);
    }
  });
});

describe("fail-on input", () => {
  it("none never fails", () => {
    const result = run({
      root: join(FIXTURES, "dead-command"),
      extraPaths: [],
      failOn: "none",
      extraAllowCommands: [],
    });
    expect(result.conclusion).toBe("success");
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("dead-only ignores no-check and contradiction findings", () => {
    const result = run({
      root: join(FIXTURES, "no-check"),
      extraPaths: [],
      failOn: "dead-only",
      extraAllowCommands: [],
    });
    expect(result.conclusion).toBe("success");
  });

  it("all fails when any finding exists", () => {
    const result = run({
      root: join(FIXTURES, "dead-path"),
      extraPaths: [],
      failOn: "all",
      extraAllowCommands: [],
    });
    expect(result.conclusion).toBe("failure");
  });
});

describe("allow-commands input", () => {
  it("silences a dead-command finding for an explicitly allowed token", () => {
    const result = run({
      root: join(FIXTURES, "dead-command"),
      extraPaths: [],
      failOn: "all",
      extraAllowCommands: ["verify-instructions-for-real"],
    });
    expect(byCheck(result.findings, "dead-command")).toEqual([]);
  });
});

// hertect-tools is a copy of Hertect-Consulting/hertect-tools, the dogfood
// repository built to carry a moved script, a removed npm script, and a deploy
// command stated two ways. Before these checks it reported two "no Check line"
// findings and nothing else.
describe("the hertect-tools dogfood fixture", () => {
  it("reports the moved script, the removed scripts, and the deploy disagreement, and notes the missing files", () => {
    const findings = findingsFor("hertect-tools");
    const summary = findings.map((f) => `${f.check} ${f.file}:${f.line}${f.lookedFor ? ` ${f.lookedFor}` : ""}`);
    expect(summary).toEqual([
      "dead-command .cursor/rules/deploy.mdc:6 deploy",
      "dead-command .cursor/rules/deploy.mdc:6 deploy:staging",
      "contradiction .cursor/rules/deploy.mdc:6",
      "dead-path AGENTS.md:10 scripts/rotate-keys.sh",
      "dead-command AGENTS.md:11 lint",
      "dead-command AGENTS.md:12 deploy:staging",
      "contradiction AGENTS.md:12",
      "no-check AGENTS.md:14",
      "no-check AGENTS.md:19",
    ]);
    expect(resultFor("hertect-tools").notes.map((n) => n.sentence)).toEqual([
      "No instruction file for Copilot and Gemini. Not a finding: nothing here says they are in use.",
    ]);
  });
});
