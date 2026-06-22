# vscode_sync_tool Complexity Report

> 歷史分析快照。現行改進優先順序請參考 [程式改進路線圖](../REPORT.md)。

日期：2026-05-25

## 頂部待辦清單

- [x] P0: 已為遠端資料夾確認、watcher 快取更新、ignore 規則行為加入聚焦測試與 mock。
- [x] P1: 優化 `FileTransfer.checkExistFolder()` 中重複檢查遠端資料夾是否存在的問題。
- [x] P1: 替換 `saveChangeFile()` 中未等待完成的 async `forEach`，讓 watcher 快取更新順序可預期。
- [x] P1: 快取或預編譯 ignore 規則，降低 `getAllowFiles()` / `getAllFiles()` 重複遍歷本地檔案的成本。
- [x] P2: 對 `addMaxConcurrency()` 的動態並行探測加入頻率限制。
- [x] P2: 依 server/config 快取成功的 FTP 檔案時間同步指令策略。
- [ ] P3: 改善極大型遠端目錄下 tree provider 的記憶體與快取行為。

## Summary

- Scope analyzed: `vscode_sync_tool/src`, `package.json`, `tsconfig.json`, existing `docs` context.
- Excluded or deprioritized: `node_modules`, `dist`, packaged `.vsix`, static assets, generated declaration output, and vendored `src/lib/ssh2-sftp-client/index.js` findings unless they affect local wrapper behavior.
- Stack detected: TypeScript VS Code extension, CommonJS, Webpack, Node 16 typings, `async.queue`, FTP/SFTP/SSH transfer helpers, `fs-extra`, `basic-ftp-proxy`, bundled `ssh2-sftp-client`.
- Test/build commands detected:
  - `npm test`
  - `npm run test:compile`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run package`
  - `npm run compile` runs `tsc -watch -p ./`
- First-pass scanner: `.agents/skills/complexity-optimizer/scripts/analyze_complexity.py vscode_sync_tool --format markdown`
- Highest-impact hotspots: repeated remote directory existence checks during upload, repeated ignore matching/local traversal, and non-awaited async cache updates in the file watcher path.
- Patch status: P0, P1, and top-checklist P2 implemented; P3 remains proposed.
- Files modified: yes. P2 added config-scoped concurrency probe throttling and FTP file-time strategy caching.

## 處理優先級

| Priority | Findings | Why first | Suggested sequence |
| --- | --- | --- | --- |
| P0 | Test harness and measurement baseline | Current repo has no dedicated tests; watcher/order and remote I/O behavior are easy to regress without mocks. | Add mocked FTP/SFTP clients, workspaceState fixture, ignore-rule fixtures, and a small traversal benchmark. |
| P1 | Finding 1, Finding 3, Finding 2 | Completed. These affect hot paths: upload queues, file watcher events, and large workspace traversal. | Implemented directory ensure cache/in-flight dedupe, watcher async ordering, and ignore matcher/traversal cache. |
| P2 | Finding 4, Finding 5 | Completed. These are important for large deployments or high-latency servers, but need server-sensitive rollout. | Implemented config-scoped concurrency probe throttling and FTP mtime strategy caching. Finding 6 remains a separate server-sensitive candidate. |
| P3 | Finding 7 and low-risk scanner leads | Mostly memory/constant-factor cleanup unless users open very large remote directories. | Clean up side-effect loops and cache invalidation after higher-impact paths are stable. |

## Scanner Notes

The scanner flagged many `nested-or-callback-loop` locations. Several are valid leads, but some are expected or low-risk:

- `src/lib/ssh2-sftp-client/index.js` is vendored code and should not be optimized locally unless the project intends to maintain a fork.
- `src/FileProvider.ts:158` is an in-memory file-system path walk with complexity proportional to path depth, which is acceptable.
- `src/CodeLensProvider.ts:239` scans top-level JSONC config nodes and selected child fields. This is linear in config size and not a primary performance risk.
- `treeProvider.ts` sorting remote directory entries is expected `O(n log n)` behavior for a sorted tree view.

## Findings

### 1. Upload directory existence checks are repeated for already-existing folders

- Location: `src/FileTransfer.ts:514`, `src/FileTransfer.ts:996`, `src/FileTransfer.ts:1205`
- Current pattern: every file upload calls `checkExistFolder()`. The `existCreateDir` set is updated only after a folder is created, not after an existing folder is successfully confirmed. For FTP, `existFTPFile()` lists the parent directory and filters by basename.
- Why it may be costly: uploading many files into the same existing remote folder can repeat the same FTP `LIST` or SFTP `exists` call for each file. FTP also scans the returned listing for each check.
- Estimated current complexity: `O(N * R)` remote metadata work for `N` uploaded files, where `R` is the average remote listing size; practically, this is `N` network round trips for the same directory.
- Recommended change: after a successful positive existence check, add the normalized folder path to `existCreateDir[config.name]`. For concurrent uploads, use an in-flight `Map<configName:path, Promise<void>>` so only one task ensures a directory at a time. For larger uploads, precompute unique remote directories and ensure them once before enqueueing file tasks.
- Estimated complexity after: `O(U * R)` for FTP or `O(U)` for SFTP, where `U` is the number of unique remote directories. For many files in one folder, this becomes one check instead of `N` checks.
- Why behavior should remain equivalent: existing missing-directory creation remains the same; the cache would record only directories that were created or positively verified.
- Risk level: Medium.
- Tests or measurements needed: mock FTP and SFTP clients for existing directory, missing directory, concurrent same-directory upload, permission error, and path normalization cases.

### 2. Ignore matching and local traversal repeat work across large file trees

- Location: `src/utils.ts:109`, `src/utils.ts:148`, `src/utils.ts:191`, `src/deploy.ts:166`, `src/FileTransfer.ts:816`
- Current pattern: `getAllFiles()` recursively walks with synchronous filesystem calls, and `isIgnore()` checks every ignore pattern with `minimatch` for each file. `getAllowFiles()` can trigger extra full traversals for negated patterns.
- Why it may be costly: deploy and folder upload paths can traverse large workspaces while running on the extension host. Every file can pay the full ignore-pattern cost, and negated rules can multiply traversal.
- Estimated current complexity: approximately `O(F * P + Nneg * F * P)`, where `F` is visited files, `P` is ignore patterns, and `Nneg` is negated ignore rules. The synchronous I/O also blocks the extension host.
- Recommended change: compile ignore matchers once per config/root and cache them until `.gitignore`, `sync_config.jsonc`, or exclude settings change. Prune ignored directories during traversal. Consider an async bounded iterator for file walking to avoid blocking the extension host.
- Estimated complexity after: still logically `O(F * P)` for ordered gitignore-compatible matching, but regex compilation and repeated config reads are removed; directory pruning can reduce visited files to the allowed subtree size.
- Why behavior should remain equivalent: ordered ignore semantics can be preserved by keeping the same rule order and treating negations explicitly.
- Risk level: Medium to High because ignore semantics and Windows path normalization are easy to regress.
- Tests or measurements needed: nested ignored directories, negated patterns, `.gitignore` comments/blanks, Windows separators, config `excludePath`, root upload, subfolder upload, and `.gitignore` cache invalidation.

### 3. File watcher cache updates use non-awaited async `forEach` and linear rename scans

- Location: `src/extension.ts:499`, `src/extension.ts:502`, `src/extension.ts:552`
- Current pattern: `saveChangeFile()` loads all configs, then uses `list.forEach(async ...)`. Each config recomputes ignore data and may update `workspaceState`. Rename/delete reconciliation scans `Object.entries(data)` to find a matching `newname`.
- Why it may be costly: this path runs on file-system events. Work can overlap under rapid saves/renames, and `myEvent.fire("update")` can run before async config updates finish. The rename scan is linear in the watch cache size for each config.
- Estimated current complexity: `O(C * (P + W))` per file event, where `C` is config count, `P` is ignore rules, and `W` is pending watch-cache entries.
- Recommended change: replace `forEach(async ...)` with `for...of` or `Promise.all` over explicit per-config tasks. Reuse cached ignore matchers. For rename reconciliation, keep a small secondary index from `newname` to original cache key, or update direct keys where possible.
- Estimated complexity after: `O(C * P)` for ignore checks with deterministic completion; rename lookup can be `O(1)` if indexed.
- Why behavior should remain equivalent: the same per-config decisions are made, but completion order becomes explicit and state updates are less race-prone.
- Risk level: High, because watcher ordering affects upload-on-save and watch-cache correctness.
- Tests or measurements needed: rapid create/edit/delete, folder rename, file rename followed by save, multiple configs, `upload_on_save` delay, `.gitignore` edits, and cache update ordering.

### 4. Dynamic concurrency probing can add many extra connection attempts

- Location: `src/FileTransfer.ts:173`, `src/FileTransfer.ts:1147`, `src/FileTransfer.ts:1170`
- Current pattern: after a task completes or is skipped, `addMaxConcurrency()` may open additional clients up to the remaining connection capacity, release them, then increment queue concurrency. It retries up to three times.
- Why it may be costly: with many tasks, this can add connection handshakes proportional to task count rather than only to actual concurrency adjustments. On FTP/SFTP servers, connection setup is usually much more expensive than local CPU work.
- Estimated current complexity: up to `O(T * M)` extra connection attempts, where `T` is task count and `M` is configured max connections.
- Recommended change: make concurrency probing config-scoped and rate-limited. Keep one in-flight probe per config, probe only when queue length is above current concurrency and a cooldown has passed, and remember recent failure/success. Another option is to ramp concurrency once at queue start and reduce only on connection errors.
- Estimated complexity after: `O(A * M)`, where `A` is the number of actual adjustment rounds and should be much smaller than `T`.
- Why behavior should remain equivalent: queue concurrency still grows only after successful connection checks; the difference is when duplicate checks are suppressed.
- Risk level: Medium to High because connection limits and transient server failures are behavior-sensitive.
- Tests or measurements needed: mocked `getClient()`/`releaseClient()` counts, large task queue, server refusing connections, skipped uploads, and mixed FTP/SFTP configs.

### 5. FTP file-time sync tries a large constant set of commands per uploaded file

- Location: `src/FileTransfer.ts:649`, `src/FileTransfer.ts:662`, `src/FileTransfer.ts:683`, `src/FileTransfer.ts:776`, `src/FileTransfer.ts:791`
- Current pattern: when `syncFileTime` is enabled, FTP upload can try multiple command variants across quoted and unquoted paths, then retry after changing directories. It then verifies remote time and may apply a correction pass.
- Why it may be costly: this is technically constant time per file, but the constant is high and every failed command is a network round trip. For many uploaded files, the overhead becomes visible.
- Estimated current complexity: `O(N * K)` remote commands, where `N` is uploaded files and `K` can be dozens of command attempts plus verification.
- Recommended change: cache the successful FTP time-sync strategy per config/server. Try the cached command shape first, fall back to the full discovery sequence only when it fails. Consider making verification configurable for users who prefer speed over correction.
- Estimated complexity after: first file remains `O(K)` discovery; later files become `O(1)` command attempts plus optional verification.
- Why behavior should remain equivalent: the fallback discovery path remains available when the cached strategy fails.
- Risk level: Medium.
- Tests or measurements needed: mocked FTP servers that support different commands, quoted filenames, spaces in paths, command failure fallback, verification drift correction, and cache invalidation after reconnect.

### 6. Remote folder downloads are sequential depth-first traversals

- Location: `src/FileTransfer.ts:946`, `src/FileTransfer.ts:971`
- Current pattern: `downloadFilesFromFTP()` and `downloadFilesFromSFTP()` list one remote directory, recursively await child directories, and enqueue file download tasks.
- Why it may be costly: broad or deep remote trees require one list round trip per directory, serialized by recursion. This is safe but can feel slow for large trees.
- Estimated current complexity: `O(D + F)` remote traversal operations, with serialized latency over `D` directories and `F` files.
- Recommended change: use bounded concurrency for directory listing while keeping file download task concurrency under the existing queue limits. Apply download exclude rules before enqueueing where possible.
- Estimated complexity after: same `O(D + F)` total work, but wall-clock latency can drop toward `O((D + F) / L)` for a safe listing concurrency `L`.
- Why behavior should remain equivalent: traversal still visits the same remote entries; only independent directory listings are scheduled concurrently.
- Risk level: Medium, because some FTP servers are sensitive to parallel commands on the same client. Use separate clients or a conservative listing limit.
- Tests or measurements needed: nested remote folders, empty folders, permission-denied directories, download excludes, FTP and SFTP differences, cancellation, and queue completion behavior.

### 7. Tree provider mapping is acceptable but can be made more memory-conscious

- Location: `src/treeProvider.ts:723`, `src/treeProvider.ts:736`, `src/utils.ts:993`
- Current pattern: every opened remote directory is fully listed, mapped into `RepositoryFileNode`s, sorted, cached in `children`, and added to `allNodes`.
- Why it may be costly: a single very large remote directory can allocate many nodes and perform `O(R log R)` sorting, where `R` is remote entries in the directory. The `allNodes` map can retain nodes until explicit refresh/clear paths run.
- Estimated current complexity: `O(R log R)` per opened directory.
- Recommended change: keep the sort, but replace `map()` used for side effects with `for...of`, track cache invalidation for `allNodes`, and consider lazy paging or a display limit for extremely large directories.
- Estimated complexity after: still `O(R log R)`, with lower memory churn and clearer cache lifetime.
- Why behavior should remain equivalent: directory ordering and displayed nodes stay the same unless paging is introduced deliberately.
- Risk level: Low for loop cleanup and cache invalidation; Medium if paging changes UI behavior.
- Tests or measurements needed: large remote directory, refresh after rename/delete/chmod, collapsed/expanded node cache behavior, and repeated connect/disconnect cycles.

## Changes Made

- Files changed: `CHANGELOG.md`, `.gitignore`, `.vscodeignore`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.test.json`, `log/**`, `src/FileTransfer.ts`, `src/extension.ts`, `src/utils.ts`, `src/watchCache.ts`, `tests/**`, `docs/archive/complexity-report-2026-05-25.md`
- Main algorithmic change: P1 remote directory checks now cache verified folders and deduplicate concurrent same-folder checks; watcher cache read/merge/write operations are serialized per config/workspace; ignore matching reuses compiled matchers during traversal and safely restores exact negated paths. P2 adds rate-limited dynamic concurrency probing and FTP file-time strategy caching.
- Complexity before: remote folder checks were up to `O(N * R)` repeated remote metadata work; watcher updates used non-awaited async iteration; ignore matching repeatedly normalized/compiled patterns during traversal; dynamic concurrency probing could add up to `O(T * M)` extra connection attempts; FTP file-time sync paid `O(N * K)` command discovery.
- Complexity after: remote folder checks are closer to `O(U * R)` for FTP and `O(U)` for SFTP, where `U` is unique folders; watcher state updates for each config/workspace are serialized to prevent lost updates; ignore matching reuses cached compiled rules; concurrency probing is limited to distinct adjustment rounds; FTP file-time sync keeps first-file discovery and later uses cached `O(1)` strategy attempts with fallback.
- Source files modified: yes.

## Verification

- Complexity scanner run: yes, using `C:\Users\USER\miniconda3\python.exe` because the default Windows `python` shim failed in this shell session.
- Typecheck run: `npm run typecheck` passed via `npm test`.
- Strict typecheck run: `npm run typecheck:strict` passed after the TypeScript toolchain update.
- Tests run: `npm test` passed, 18 tests passing.
- Test coverage added: mocked FTP/SFTP directory ensuring, existing-directory cache reuse, concurrent same-folder dedupe, concurrency probe in-flight reuse/cooldown, FTP file-time strategy caching, watcher cache merge/serialization behavior, exact-file negated ignore restoration, and workspace escape rejection.
- Lint run: `npm run lint` passed with warnings only: 1474 warnings, 0 errors.
- Build/package run: `npm run package` passed.
- VSIX file-list verification: passed; `log/log.configuration.json` and `log/log.tmLanguage` are included.
- Production dependency audit: `pnpm audit --prod` passed with 0 vulnerabilities.
- Benchmark or measurement: not run; improvements are covered by focused unit tests and static complexity reasoning.
- Residual risk: performance impact depends heavily on real workspace size, ignore-pattern count, remote server latency, and configured upload concurrency. Finding 6 remote folder listing remains intentionally separate because safe parallel listing likely needs a per-server connection strategy.
