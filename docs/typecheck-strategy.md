# Type-check Strategy

## Why these settings exist

### `transpileOnly: true` (webpack `ts-loader`)
- Effect: webpack only transpiles TypeScript to JavaScript, and **does not** perform TS type-checking during bundle build.
- Benefit: much faster and more stable packaging in this project.
- Risk: type errors may not be caught by `npm run package`.

### `skipLibCheck: true` (`tsconfig.json`)
- Effect: skips type-checking for `.d.ts` files from dependencies.
- Benefit: avoids third-party type noise and reduces type-check time.
- Risk: some declaration-level incompatibilities in dependency typings may be hidden.

## Should we change them now?

Current recommendation: **do not force-change in build path yet**.

- Keep `transpileOnly: true` for packaging reliability and speed.
- Keep `skipLibCheck: true` in default `tsconfig.json` for day-to-day work.
- Add separate checks in CI/release gate.

## Suggested process

1. Local/dev fast path:
- `npm run package`

2. Release/CI type-check gate:
- `npm run typecheck` (project type-check, follows tsconfig)
- `npm run typecheck:strict` (includes library declaration check)

## Decision log

- 2026-02-25: Introduced explicit scripts `typecheck` and `typecheck:strict`.
- If `typecheck:strict` becomes stable for multiple releases, consider:
  - setting `skipLibCheck` to `false`, and/or
  - removing `transpileOnly` with a measured build-time impact evaluation.
