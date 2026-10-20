[<img src="docs/brand/ctrl-alt-delegate-wordmark.png" width="480" alt="Ctrl Alt Delegate">](https://hertect.com/ctrl-alt-delegate)


**Your AI tools know your version. Ctrl Alt Delegate knows everyone's.**

Every rule, skill, AI tool, and codebase. Where it lives. What it touches. Who owns it. What changed since anyone last checked it.

AI coding tools like Claude Code, GitHub Copilot, and Cursor read a file in your repo before they do any work. AGENTS.md, CLAUDE.md, a Copilot instructions file, a Cursor rule. It tells them how to test, what not to touch, which commands to run. That file is how your agents get told what to do.

Those files go stale. The command it names gets renamed. The folder it points at moves. Two files in the same repo say different things. The agent follows the file anyway, and nothing tells you.

Ctrl Alt Delegate reads those files on every pull request and fails the check when they're wrong. Free for any repo.

## Install

```yaml
# .github/workflows/ctrl-alt-delegate.yml
name: Ctrl Alt Delegate
on: pull_request
permissions:
  pull-requests: write
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Hertect-Consulting/cad-action@v1
```

`fail-on` sets what fails the check: `all` (default), `dead-only` (dead command and dead path findings only), or `none` to report without going red. `paths` adds extra file globs to discover, on top of the built-in rules-and-skills list below.

## What it checks

Five checks, each a finding with file, line, and one sentence. Prose counts: a heading-style file, a one-paragraph CLAUDE.md, or a Cursor rule with no headings is read line by line, not only the five-line shape, and every line of a `sh`, `bash`, `shell` or unlabelled code fence is read as a command.

1. **Dead command.** A Check or What line backticks a command nothing defines; a sentence says to run one (`` run `buildit` ``); or any line backticks `npm run`, `npm test`, `pnpm <script>`, `yarn <script>`, or `make <target>` with a script or target that is not in package.json or the Makefile. A workspace form (`pnpm --filter web test`, `npm run test -w web`, `yarn workspace web test`) is resolved against every package.json in the repository. The tool stays on the allow list; it is the argument that is checked. Findings: `` Dead command: `buildit` — no package.json script, Makefile target, or CI workflow binary named `buildit`. ``, `` Dead command: `npm run lint` — package.json has no script named `lint`. `` and `` Dead command: `make deploy` — no Makefile target named `deploy`. ``
2. **Dead path.** Applies to, What, or Check names a path or glob matching nothing at the head commit; or a sentence backticks a path, a document, or a glob that is not there, the way a moved script leaves a stale mention behind. A path git ignores is absent by design and is never reported. Findings: `` Dead path: `src/legacy/**` matches no files at the head commit. ``, `` Dead path: `docs/runbook.md` does not exist at the head commit. `` and `` Dead path: `scripts/rotate-keys.sh` — `scripts/` exists but has no `rotate-keys.sh`. ``
3. **No Check line.** A rule with an empty or missing Check, or a heading-style rule with no command and no path anywhere in it. Finding: `` No Check line: "Keep the build current" has an empty or missing Check. ``
4. **No instruction file.** A tool the Action knows (Codex, Claude Code, Cursor, Copilot, Gemini) has no file to read in this repository, so it follows nothing. A finding when the repository has no instruction file at all, or when the tool's own folder (`.claude/`, `.cursor/`, `.codex/`, `.gemini/`, `.github/instructions/`) is there without its file; otherwise a one-line note above the findings that never fails the check. Finding: `` No instruction file: Claude Code reads CLAUDE.md, and this repository has none at the head commit. ``
5. **Contradiction.** Two files set a different Check for the same purpose (test, lint, build, typecheck, deploy), state the same script or target two ways in prose, or state a different version for the same tool (Node, Python, Go). Findings: `` Contradiction: the test Check here is `npm test`, but `pnpm test` (CLAUDE.md) says otherwise. `` and `` Contradiction: the deploy command here is `npm run deploy:staging`, but `npm run deploy` (.cursor/rules/deploy.mdc) says otherwise. ``

One sticky PR comment, grouped by check, updated on each run — never a new comment per run.

## What it reads

The rules and skills in these files, at the pull request's head commit:

- `AGENTS.md` (root and nested)
- `CLAUDE.md`, following one level of `@import`
- `.github/copilot-instructions.md`
- `.cursor/rules/**/*.mdc` and `.cursorrules`
- `GEMINI.md`
- `**/SKILL.md`

## When it flags something

CAD holds every rule to the same five-line shape:

```
What: One plain sentence.
Applies to: A path or glob.
Check: A command that passes, or something visible in the PR.
Owner: @handle
Reviewed: YYYY-MM-DD
```

If you can't write the Check line, the rule is a wish, not a rule. Starter files in each of the five kinds are in [`templates/`](templates/) — copy the one you need and edit it. The code in this repo is MIT licensed; the templates are CC BY 4.0.

## What it never does

Writes to your repo, opens PRs, rewrites your rules, sends your data anywhere, looks at other repos, or keeps state between runs.

## Notes

- If your GitHub organization restricts Actions to verified creators, add `Hertect-Consulting/cad-action` to the allow list first: Organization Settings → Actions → General → Policies.
- Pull requests from forks get a read-only token, so CAD can't post a PR comment there — it writes findings to the job summary instead. Same-repo PRs still get the sticky comment.

---

Receipts for one repo. Ctrl Alt Delegate keeps them for all of yours. [hertect.com/ctrl-alt-delegate](https://hertect.com/ctrl-alt-delegate)
