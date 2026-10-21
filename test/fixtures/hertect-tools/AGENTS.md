# Hertect Tools agent instructions

This file is read by every agent tool on this repo. Codex reads it directly. Claude Code
reads it through CLAUDE.md, which contains only: `Read AGENTS.md and follow it.`

## Scripts

- `scripts/backup.sh` backs up the shared config bucket to cold storage. Run it manually
  before any config migration.
- `scripts/rotate-keys.sh` rotates the shared API keys used by internal tooling. Run
  `npm run lint` before committing any change to it.
- Deploy staging with `npm run deploy:staging` before ever touching production.
- Run `npm run typecheck` before pushing.

## Standing rules

- Do not commit credentials or private keys. The Cloudflare Web Analytics site token is
  public configuration, not a secret.

Owner: @hertect-ops

## Scope boundaries

- This repository is internal tooling only, not customer-facing. Do not add customer data
  or connect it to a customer-facing service.
