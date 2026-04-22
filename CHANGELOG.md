# Changelog

## Supported Languages

- [繁體中文](docs/i18n/CHANGELOG.zh-TW.md)
- [詳細變更追蹤（繁體中文）](docs/i18n/CHANGELOG_DETAIL.zh-TW.md)

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

### Added
- `skipCompareMode` option: choose comparison criteria — `"size+mtime"` (default), `"size"`, or `"mtime"`.

### Improved
- Renamed `skipIfSameSize` → `skipIfSame` (backward compatible — old configs auto-migrate).
- Skip logic: when a file is skipped, only `[skipUpload]` is logged — the `[upload]` line is no longer shown.
- Error handling: added semantic comments to all empty `catch` blocks across core files.
- Logging: replaced all `console.log` / `console.error` / `console.warn` calls with `oConsole.*` (controlled via settings).
- Removed dead-code `skipIfSameSize` fallback in `shouldSkipUpload()` (config migration already handles conversion).
- Connection pool robustness: `cleanupConnectionPool` now accepts a `maxIdle` cap with try-catch protection; `releaseClient` closes excess connections instead of returning them to the pool; all `close()`/`end()` calls are wrapped in try-catch.
- Added `.vscode/` to `.gitignore`.

## v0.6.0

### Added
- `syncFileTime` option to sync remote file modification time after upload (FTP/SFTP/SSH).
- `skipIfSameSize` option to skip upload when remote file size and modification time are identical (default: true).
- `uploadDelay` option to debounce uploads and start upload N seconds after the last change (default: 0).
- Explicit validation errors for FTP password-only auth and invalid/missing key-path fallback cases.

### Fixed
- SFTP file time sync by calling underlying ssh2 `utimes` and `exec touch` fallback.
- Windows build compatibility (`package` script, webpack ts-loader `transpileOnly`).
- MOVE/rename sync on Windows: normalize remote paths before existence checks so remote rename executes instead of fallback upload.
- `uploadDelay` behavior to true debounce mode: upload starts N seconds after the last change, avoiding repeated uploads during frequent edits.

### Improved
- Authentication behavior: `sftp/ssh` now prefer `privateKeyPath`, then fallback to `password`.
- Restored `privateKeyPath` and `secretKeyPath` in default config templates and generated examples.
- Updated config templates for all 13 supported languages.

### Docs
- Synced authentication priority and runtime error messages to all localized README files.
- Synced build command instructions to all localized README files.

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
