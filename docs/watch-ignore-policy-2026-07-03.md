# Watcher Ignore Policy Gate - 2026-07-03

## Context

VS Code reports both same-folder renames and cross-folder moves as rename events. In the old watcher pipeline, the ignore check only evaluated the old path before enqueueing watch-cache or upload-on-save work.

Observed case:

```text
[2026-07-03 11:46:50][CWISELab][sftp][rename][0.78 s]: /volumes/FESGRDTHFYJGUYH -> /volumes/tools/FESGRDTHFYJGUYH
```

With `excludePath` containing `tools/**`, the destination path should be excluded. The old pipeline still treated the event as a remote rename because `/volumes/FESGRDTHFYJGUYH` was not ignored.

## Change

Added a watcher policy gate in `resolveWatchChangeForIgnore()` before upload-on-save scheduling and watch-cache enqueueing. The gate evaluates both `oldPath` and `newPath` against the merged ignore rules and returns the sync action that should actually happen.

Policy matrix:

| Old path | New path | Sync action |
| --- | --- | --- |
| allowed | allowed | `rename` |
| allowed | ignored | `delete` old remote path |
| ignored | allowed | `add` new path |
| ignored | ignored | skip |

## Rename vs Move

The filesystem event remains a rename-like path change, but the tool now records an additional `pathChangeType`:

| Condition | Classification |
| --- | --- |
| `dirname(oldPath) === dirname(newPath)` | `rename` |
| `dirname(oldPath) !== dirname(newPath)` | `move` |

The remote queue still uses `operationType: 'rename'` because FTP/SFTP rename APIs handle both same-folder renames and cross-folder moves. Logs can show `[rename]` or `[move]` through `pathChangeType`.

## Files Changed

- `src/utils.ts`: added `resolveWatchChangeForIgnore()` and `getPathChangeType()`.
- `src/extension.ts`: routes watcher changes through the policy gate before scheduling upload-on-save or writing watch cache.
- `src/deploy.ts`: forwards `pathChangeType` from watch-cache operations into transfer tasks.
- `src/events/uploadOnSave.ts`: forwards `pathChangeType` for immediate rename/move tasks.
- `src/output.ts`: displays `[rename]` or `[move]` when `pathChangeType` is present.
- `src/types/config.ts`: added `PathChangeType` and optional `pathChangeType` metadata.
- `tests/ignoreRules.test.ts`: added coverage for moves into ignored paths, moves out of ignored paths, and rename-vs-move classification.

## Verification

```text
npm test
39 passing
```
