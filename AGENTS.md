# Coding agent rules: Ponytail-style minimalism

Scope: this file applies to the whole `vscode_sync_tool` repository.

Default to the smallest safe change. Before writing code, apply this ladder:

1. Does this need to exist at all? If not, skip it and explain briefly.
2. Does this already exist in the codebase? Reuse the existing helper, type, pattern, or file.
3. Does the standard library solve it? Use that first.
4. Does a native platform feature solve it? Prefer that over custom code.
5. Does an already-installed dependency solve it? Use it before adding anything new.
6. Can the change be one line or a very small localized diff? Prefer that.
7. Only then, write the minimum code that works.

Hard rules:

- Do not add new dependencies unless explicitly approved.
- Do not add abstractions, factories, config layers, wrappers, or future-proofing unless required.
- Prefer deletion over addition.
- Prefer boring code over clever code.
- Fix the root cause in the shared path, not just the reported symptom.
- Before changing a shared function, inspect its callers.
- Keep changes in the fewest files possible.

Never simplify away:

- validation at trust boundaries
- security checks
- error handling that prevents data loss
- accessibility
- tests needed to preserve behavior
- anything explicitly requested by the user

For non-trivial logic, leave the smallest runnable check: one focused test, an assert-based self-check, or an existing test command.

## Startup checklist

1. Read this file first, then read `docs/REPORT.md`.
2. Treat `docs/REPORT.md` as the project roadmap, not as proof that work is complete.
3. Inspect the worktree before editing. Preserve unrelated user or agent changes.
4. If the user asks for devspace MCP, call `open_workspace` first and use the returned workspace. If the user says not to use MCP, work directly in the local checkout.

## Collaboration rules

- Never claim P0 is complete just because the report says so; verify against the current worktree.
- If a test, typecheck, lint, build, package, or audit gate fails, report the exact command and the first useful error.
- Avoid unrelated refactors, broad formatting, and rename churn.
- Do not run `git reset --hard`, `git checkout --`, destructive cleanups, commits, pushes, releases, or Git history rewrites unless explicitly requested.
- Do not hand-edit generated outputs such as `node_modules/`, `.test-out/`, `*.vsix`, `lib/`, or `types/`.

## Project implementation rules

- Main language: TypeScript.
- Preserve the intent of `strict` and `noImplicitAny`; do not spread `any` to make errors disappear.
- Prefer focused tests over manual-only validation.
- Keep compatibility with the approved target `engines.vscode: ^1.101.0`; do not raise the minimum further without explicit user approval.
- If user-visible strings, command titles, or package contributions change, update `package.nls*.json` and `l10n/bundle.l10n*.json`, then run the i18n check.
- Path logic must handle Windows local paths and POSIX-style remote paths.

## P0 invariants

P0 means correctness and reliability. Changes touching these areas must preserve the following:

- Queue finalization: success, failure, cancellation, and stop paths must enter config/workspace-scoped finalize. Finalize must be idempotent and must not overwrite failure diagnostics.
- Cache cleanup: completed deployments clear watch cache; failed, cancelled, and stopped deployments retain retryable watch entries. Every terminal state must consistently clean confirmed remote folder cache and pending folder checks, and update Tree View / Status Bar.
- Ignore semantics: upload and download must share compiled matcher semantics: normalization, negation, last-match-wins, and root-boundary protection.
- Remote traversal: FTP/SFTP folder downloads must prune ignored subtrees before listing when no negation can restore descendants.
- Multi-root: config, queue, connection pool, watch cache, debounce, Tree node, temp file, and `.gitignore` cache keys must include workspace scope. Never guess the first workspace root in multi-root mode.
- CI/release gate: PR and release flows must catch test, type, i18n, lint, production build, audit, and VSIX packaging failures.

If any P0 invariant lacks coverage or a required gate fails, do not mark P0 as confirmed complete.

## Verification commands

Prefer the pinned package manager via Corepack:

- `corepack pnpm test`
- `corepack pnpm run typecheck:strict`
- `corepack pnpm run check:i18n`
- `corepack pnpm run lint --quiet`
- `corepack pnpm run package`
- `corepack pnpm audit --prod` (requires network)
- `corepack pnpm run test:vscode:min`
- `corepack pnpm run test:vscode:stable`

VSIX packaging:

```sh
npx --yes @vscode/vsce@3.9.2 package --no-dependencies
```

On Windows/MSYS, if VSCE cannot find `dist/extension.js`, run the same command through native `cmd.exe` or PowerShell and explain why.
