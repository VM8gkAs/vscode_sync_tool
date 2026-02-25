# Changelog

[繁體中文日誌](https://github.com/oorzc/vscode_sync_tool/blob/main/docs/i18n/CHANGELOG.zh-TW.md)

## v0.6.0

- Added `syncFileTime` option to sync remote file modification time after upload (FTP/SFTP/SSH).
- Added `skipIfSameSize` option to skip upload when remote file size and modification time are identical (default: true).
- Added `uploadDelay` option to debounce uploads and start upload N seconds after the last change (default: 0).
- Fixed SFTP file time sync by calling underlying ssh2 `utimes` and `exec touch` fallback.
- Fixed Windows build compatibility (`package` script, webpack ts-loader `transpileOnly`).
- Updated config templates for all 13 supported languages.
- Restored `privateKeyPath` and `secretKeyPath` in default config templates and generated examples.
- Changed authentication behavior: `sftp/ssh` now prefer `privateKeyPath`, then fallback to `password`.
- Added explicit validation errors for FTP password-only auth and invalid/missing key-path fallback cases.
- Synced authentication priority and runtime error messages to all localized README files.
- Fixed MOVE/rename sync on Windows: normalize remote paths before existence checks so remote rename executes instead of fallback upload.
- Fixed `uploadDelay` behavior to true debounce mode: upload starts N seconds after the last change, avoiding repeated uploads during frequent edits.
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
