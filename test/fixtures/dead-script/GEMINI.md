# GEMINI.md

## Deploying
Deploy staging with `npm run deploy:staging` before touching production.
Run `pnpm run build` first.
Run `pnpm --filter web e2e` nightly, or `npm run e2e -w web`, or `yarn workspace web e2e`.
Run `pnpm --filter web lint` before that.
