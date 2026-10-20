# AGENTS.md

## Scripts
- `scripts/backup.sh` backs up the bucket.
- `scripts/rotate-keys.sh` rotates keys.
- Branch from `origin/main` and read `tools/rotate-keys.sh`.
- Send `Accept: application/json` and set the `X-Frame-Options` header.

## Docs
- See `docs/runbook.md` for the deploy steps and `CONTRIBUTING.md` for the branch model.
- Every `src/**/*.test.ts` file runs in CI; `Node.js` 20 is the runtime and `.env` is never committed.
- `README.md` lives in every package, and `*.md` files are checked by the linter.
- Ship with `.claude/commands/ship.md`; design lands via `design/*` PRs; never edit `node_modules/next/dist/x.js`; worktrees go in `.claude/worktrees/**`.
- Generated types land in `generated/schema.json`, which is never committed.
