# GEMINI.md

## Before pushing

Run `buildit` before pushing, then run `git status` to confirm the tree is clean.
Run `npm run build && make lint` as the last step; it runs `./scripts/check.sh` for you.
The `verify` script is the slow one, so `feature flag` work can skip it.
Set the `X-Frame-Options` header on every response.

## Type safety

Run `pnpm typecheck` before every commit, and run `yarn install` after pulling.
Run `yarn build` to confirm the bundle still compiles. Deploy via `make deploy`.
Never run `prisma migrate reset` against a shared database.

## Release

```sh
$ npm run lint
# the next line is the slow one
make release
npm run build
```

```json
{ "scripts": { "test": "vitest run" } }
```
