# Changelog

## Supported Languages

- [繁體中文](docs/i18n/CHANGELOG.zh-TW.md)
- [詳細變更追蹤（繁體中文）](docs/i18n/CHANGELOG_DETAIL.zh-TW.md)

## Next Version

### Added
- Added `SyncTools.configStorePath` plus commands to select or reset an external `sync_config.jsonc` directory. Multi-root workspaces use stable `<project>-<hash>` directories, same-name projects remain isolated, and existing target files are never overwritten.
- Added focused coverage for external-path validation, project-root migration fallback, same-name workspace isolation, external configuration loading without `.gitignore` mutation, and relocation rollback after an I/O failure.

### Changed
- Removed the encrypted extension expiration gate; extension activation no longer stops at a hard-coded date.
- Adapted the upstream external-config idea to the current multi-root and cache model instead of importing upstream generated files, repository agent rules, or vendored SFTP changes.
- Configuration relocation now rolls back staged copies and reports a localized error if copying or updating the global setting fails, so an I/O error does not abort extension activation.

## v0.6.3 (2026-07-17)

### Added
- Added focused regression coverage for queue terminal states, multi-root scope isolation, Git argument safety, retry connection cleanup, and empty deployment finalization.
- Added optional workspace-scoped file logging through `SyncTools.logToFile` and `SyncTools.logDirectory`; enabled logs append to `sync-tools.log` under `sync_logs` by default.
- Added per-environment `localTraversalConcurrency` (default `4`) and `downloadTraversalConcurrency` (default `2`) settings to `sync_config.jsonc`; remote traversal can be restored to the previous serial behavior by setting it to `1`.
- Added watcher ignore-policy tests for moves into and out of ignored paths, rename-vs-move classification, and the policy record in `docs/watch-ignore-policy-2026-07-03.md`.

### Improved
- Completed P1 localization and trust boundaries: runtime messages now use the VS Code localization API, build terminology is consistent, and the i18n gate also detects source strings missing from the base bundle.
- Replaced async Promise executors in deployment finalization and ignore configuration loading with direct async functions so cancellation and cache errors settle predictably.
- Reduced high-frequency internal transfer, connection-pool, and watcher debug logging while retaining localized user diagnostics and structured technical error tags.
- Scoped configuration caches, queues, connection pools, watcher state, Tree nodes, upload debounce keys, and temporary remote-file caches by workspace.
- Replaced loose queue, watcher, event, and FTP/SFTP client values with explicit TypeScript unions and client boundaries.
- Replaced shell-composed Git submission with fixed `execFile("git", args)` steps and structured failure classification.
- Unified successful, failed, cancelled, stopped, skipped, and empty deployment paths through config-scoped finalization.
- Kept the newest Output entries up to `SyncTools.logNumberLimit`, and excluded the enabled file-log directory from synchronization.
- Replaced blocking local directory scans with ordered, ignore-aware, bounded asynchronous I/O.
- Indexed watcher rename targets and batched burst persistence so each config/workspace performs one state read/write per batch.
- Added bounded FTP/SFTP directory discovery with stable task order, atomic discovery failure, and a connection budget shared with file transfers.
- Batched Tree completion refreshes, replaced the node index with a `Map`, unified subtree eviction, and moved cache deletion off synchronous filesystem APIs.
- Classified watcher path changes as `rename` when the parent directory is unchanged and `move` when it changes, while retaining the protocol-compatible remote rename operation.

### Fixed
- Prevented untrusted workspaces from executing `config.build`; users can open Workspace Trust management and retry synchronization after granting trust.
- Preserved the `cancelled` deployment terminal state instead of allowing direct-async error propagation to overwrite it as `failed`.
- Preserved each child file's workspace-relative suffix when a watched directory is uploaded, preventing SFTP `fastPut` from receiving the parent directory (for example `/volumes/html/wordcloud/lib`) as a file destination.
- Overrode the vulnerable `socks` transitive dependency `ip-address` with 10.3.1 after the August 2026 advisories; production audit is back to zero known vulnerabilities.
- Treated trailing globstar exclusions such as `tools/**` as matching both the `tools` directory root and all descendants, preventing parent-directory watcher events from entering the upload queue.
- Skipped obsolete upload tasks when their local source was renamed or removed, before opening a connection or creating a remote parent directory; this prevents ENOENT retry loops and duplicate old directories after a folder rename.
- Ignored transient watcher change events whose local path disappeared before `lstat`, instead of surfacing an ENOENT error.
- Overrode vulnerable `brace-expansion` transitive versions with 5.0.9 after the July 2026 advisories; production audit is back to zero known vulnerabilities without changing the VS Code 1.82 minimum.
- Restored awaited Tree refresh handling so the refresh mutex remains held until node updates complete.
- Prevented a released client from being returned to the connection pool again when a retry cannot reconnect.
- Finalized deployments that enqueue no transfer tasks instead of leaving the Tree View in a busy state.
- Corrected the Stop Sync command to use its own localized title instead of the Pause Sync title.
- Corrected the pnpm lint argument forwarding used by CI.
- Prevented successful queue finalization from clearing Output history; logs now remain until the explicit Clear All Log command or the configured entry limit removes the oldest records.
- Prevented watcher rename/move events from bypassing destination exclude rules; moves into ignored paths now delete the old remote path, moves out become uploads, and ignored-to-ignored moves are skipped.
- Prevented concurrent folder traversals from deadlocking while waiting for extra connections; traversal immediately falls back to its existing client when the shared budget has no spare lease.
- Normalized bulk folder-upload relative paths to POSIX separators so Windows paths cannot introduce backslashes into remote task paths.

## v0.6.2

### Improved
- Reduced repeated remote directory existence checks by caching verified folders and deduplicating in-flight folder checks.
- Made watcher cache updates deterministic by replacing non-awaited async iteration with awaited per-config processing.
- Serialized watcher cache read/merge/write operations per config and workspace to prevent lost updates during rapid file events.
- Cached compiled ignore matchers and reused them during recursive local file traversal.
- Rate-limited dynamic upload concurrency probing and reused in-flight probes per config.
- Cached successful FTP modification-time command strategies per server/config, with fallback discovery when a cached strategy fails.
- Updated production dependencies and locked vulnerable transitive packages; the production dependency audit now reports zero vulnerabilities.

### Fixed
- Included the declared Log language configuration and grammar in packaged VSIX files.
- Fixed negated ignore rules resolving outside or against the wrong path on Windows, including exact-file restores.

### Changed
- `npm test` now runs a finite typecheck and unit-test flow instead of the previous watch-mode compile pretest.
- Raised the minimum supported VS Code version from 1.73 to 1.82 and aligned extension-host typings with Node 18.15.
- Updated TypeScript to 5.9.3, refreshed the Node 18 typings, and fixed the stricter cache-key type check.
- Added CI Extension Host coverage for both VS Code 1.82 and the current Stable release.
- Migrated ESLint to flat config and updated ESLint to 9.39.4 with typescript-eslint 8.61.1.
- Updated Mocha to 11.7.6, webpack-cli to 7.0.3, and javascript-obfuscator to 5.4.3; production builds now use webpack's supported `--mode production` flag.

### Added
- Added a P0 complexity baseline test harness with Mocha, TypeScript test compilation, and VS Code API mocks.
- Added focused baseline coverage for remote directory ensuring, watch-cache merge behavior, and ignore-rule traversal behavior.
- Added a real VS Code 1.82 Extension Host integration test for the declared minimum supported version.

## v0.6.1

### Fixed
- SFTP path traversal bug on Windows: `path.join` produced backslashes in remote paths, causing uploads to wrong destinations. All remote path construction now uses `path.posix.join` + `posixRelative()` helper.
- Duplicate upload events: `onDidSaveTextDocument` and `onDidChange` could both fire for the same file.
- Folder rename sync: renaming a local folder no longer re-uploads all contents; the remote folder is renamed directly via `client.rename()`.
- Connection pool cleanup bug: `startCleanupTimer` used `return` instead of `continue`, causing idle connection pools to never be cleaned when any single queue was busy.
- `uploadOnSave` unnecessarily pre-fetched a client connection that was never used (all branches delegate to `FileTransfer.addTask` which manages its own connections).
- `uploadFile` used `new Promise(async ...)` anti-pattern that could silently swallow unhandled exceptions; refactored to direct `async` function.
- `uploadFile` SFTP branch created a `ReadStream` only to read its `.path` property without consuming or closing the stream; replaced with direct file path usage.
- 8 `iconPath` type errors in `treeProvider.ts` (`string` → `vscode.Uri.file()`).
- 8 `l10n.t()` overload mismatches in `treeProvider.ts` (array args → spread args).
- FTP empty file upload side-effect: previously wrote a space character directly into the local file, corrupting its content; now uses a temp file (`.ftp_tmp`) for upload and auto-cleans up afterward.

### Improved
- Renamed `skipIfSameSize` → `skipIfSame` (backward compatible — old configs auto-migrate).
- Skip logic: when a file is skipped, only `[skipUpload]` is logged — the `[upload]` line is no longer shown.
- Error handling: added semantic comments to all empty `catch` blocks across core files.
- Logging: replaced all `console.log` / `console.error` / `console.warn` calls with `oConsole.*` (controlled via settings).
- Removed dead-code `skipIfSameSize` fallback in `shouldSkipUpload()` (config migration already handles conversion).
- Connection pool robustness: `cleanupConnectionPool` now accepts a `maxIdle` cap with try-catch protection; `releaseClient` closes excess connections instead of returning them to the pool; all `close()`/`end()` calls are wrapped in try-catch.
- Added `.vscode/` to `.gitignore`.

### Added
- `skipCompareMode` option: choose comparison criteria — `"size+mtime"` (default), `"size"`, or `"mtime"`.

## v0.6.0

### Fixed
- SFTP file time sync by calling underlying ssh2 `utimes` and `exec touch` fallback.
- Windows build compatibility (`package` script, webpack ts-loader `transpileOnly`).
- MOVE/rename sync on Windows: normalize remote paths before existence checks so remote rename executes instead of fallback upload.
- `uploadDelay` behavior to true debounce mode: upload starts N seconds after the last change, avoiding repeated uploads during frequent edits.

### Improved
- Authentication behavior: `sftp/ssh` now prefer `privateKeyPath`, then fallback to `password`.
- Restored `privateKeyPath` and `secretKeyPath` in default config templates and generated examples.
- Updated config templates for all 13 supported languages.

### Changed
- Synced authentication priority and runtime error messages to all localized README files.
- Synced build command instructions to all localized README files.

### Added
- `syncFileTime` option to sync remote file modification time after upload (FTP/SFTP/SSH).
- `skipIfSameSize` option to skip upload when remote file size and modification time are identical (default: true).
- `uploadDelay` option to debounce uploads and start upload N seconds after the last change (default: 0).
- Explicit validation errors for FTP password-only auth and invalid/missing key-path fallback cases.

## v0.4.0

Refactored the project to support multiple languages, multiple connection methods, and more practical functions

## v0.2.7

Support remote decompression and deletion of compressed files uploaded remotely after compression

## v0.2.4

Support Agent

## v0.2.0

Add Download File

## v0.1.0

Adding Internationalization

## v0.0.5

Experience optimization

## v0.0.3

Version Release
