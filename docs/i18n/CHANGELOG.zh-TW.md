# 更新日誌

## 下一版本

### 新增
- 新增 `SyncTools.configStorePath`，以及選擇／重置外部 `sync_config.jsonc` 目錄的命令；multi-root 使用穩定的 `<專案>-<雜湊>` 目錄隔離同名專案，且不覆寫既有目標檔案。
- 新增外部路徑驗證、專案根目錄遷移 fallback、同名 workspace 隔離、外部設定讀取不修改 `.gitignore`，以及 I/O 失敗後搬移回復的聚焦測試。

### 變更
- 移除加密的擴充套件到期閘門，不再因硬編碼日期停止啟動。
- upstream 外部配置概念已配合目前 multi-root 與 cache 模型重新實作；未帶入生成檔、repository agent rule 或 vendored SFTP 修改。
- 配置搬移若在複製或更新全域設定時失敗，會回復已暫存的副本並顯示本地化錯誤，不會讓 I/O 錯誤中止擴充套件啟動。

## v0.6.3（2026-07-17）

### 新增
- 新增 queue 終態、multi-root scope 隔離、Git 參數安全、retry 連線清理與空部署 finalize 的聚焦回歸測試。
- 新增 `SyncTools.logToFile` 與 `SyncTools.logDirectory`；啟用後預設將 Output 內容追加寫入 `<workspace>/sync_logs/sync-tools.log`。
- 新增每環境的 `localTraversalConcurrency`（預設 4）與 `downloadTraversalConcurrency`（預設 2）；遠端 traversal 設為 1 可恢復舊版序列行為。
- 新增 watcher 移入／移出 ignored path、rename-vs-move 分類測試，以及 `docs/watch-ignore-policy-2026-07-03.md` policy 紀錄。

### 改善
- 完成 P1 本地化與信任邊界：runtime 訊息統一使用 VS Code l10n、Build／建置術語一致，i18n gate 也會偵測原始碼引用但基準 bundle 缺少的 key。
- `Deploy.start()` 與 `getIgnoreConfig()` 改為直接 async function，取消與 cache 錯誤都能穩定 settled。
- 移除高頻且重複的 transfer、connection-pool 與 watcher debug log，保留本地化使用者診斷與結構化技術錯誤標籤。
- config cache、queue、connection pool、watcher state、Tree node、upload debounce 與遠端暫存檔全部納入 workspace scope。
- queue、watcher、event 與 FTP/SFTP client 邊界改用明確 TypeScript union／interface。
- Git submit 改用固定的 `execFile("git", args)` 步驟與結構化錯誤分類，不再組合 shell command。
- successful、failed、cancelled、stopped、skipped 與 empty deployment 統一經過 config-scoped finalize。
- Output 只保留最新 `SyncTools.logNumberLimit` 筆；啟用檔案 log 時會自動排除該目錄，避免同步自己的 log。
- 本機 traversal 改為保序、ignore-aware 的有界非同步 I/O，不再以同步 filesystem API 阻塞 Extension Host。
- watcher rename target 改用索引，並批次合併 burst persistence；每個 config／workspace 每批只讀寫一次 state。
- FTP/SFTP 目錄 discovery 改為有界並行、穩定 task order、整批失敗，並與 file transfer 共用連線額度。
- Tree 完成事件改為批次 refresh，node index 改用 `Map` 並統一 subtree eviction；cache 刪除移出同步 filesystem API。
- watcher 同父目錄路徑變更標記為 `rename`、跨父目錄標記為 `move`，底層仍使用相容 FTP/SFTP 的遠端 rename 操作。

### 修正
- 未信任工作區不再執行 `config.build`；使用者可開啟 Workspace Trust 管理，信任後再重新同步。
- Deploy 取消後維持 `cancelled` 終態，不會因直接 async 錯誤傳遞被覆寫為 `failed`。
- watch 模式若將資料夾記為待上傳，展開其中檔案時現在會保留每個子檔的 workspace-relative 路徑，避免 SFTP `fastPut` 把父目錄（例如 `/volumes/html/wordcloud/lib`）當成檔案目的地。
- 因應 2026 年 8 月新公告漏洞，將 `socks` 的傳遞依賴 `ip-address` 覆寫為 10.3.1；production audit 恢復為零已知漏洞。
- `tools/**` 等尾端 globstar 規則現在同時排除 `tools` 目錄根與全部子項目，避免 parent-directory watcher event 進入 upload queue。
- 本機來源已改名或刪除時，stale upload task 會在連線與建立遠端父目錄前結束，不再反覆回報 ENOENT，也不會在資料夾改名後留下舊遠端目錄。
- watcher change event 在 `lstat` 前路徑已消失時會安全略過，不再拋出 ENOENT。
- 2026 年 7 月新公告影響 `brace-expansion` 的漏洞改以 5.0.9 覆寫傳遞版本；production audit 恢復為零已知漏洞，最低 VS Code 仍維持 1.82。
- 等待 Tree refresh 完成後才釋放 mutex，避免 node 尚未更新就進入下一批事件。
- retry 重新連線失敗時不再把已歸還的 client 重複放回 connection pool。
- 空部署也會進入 completed finalize，不再讓 Tree View 停留在 busy。
- Stop Sync command 改用自己的 l10n title；CI 的 pnpm lint 參數也改為有效的 error gate。
- 成功 finalize 不再清除 Output；記錄只會由 Clear All Log 或數量上限移除。
- watcher rename/move 同時檢查 old/new path；移入 ignored path 會刪除舊遠端路徑，移出會轉為 upload，兩端都 ignored 則跳過。
- 遠端 traversal 無額外 connection lease 時立即沿用現有 client，避免多個 traversal 互相等待形成 deadlock。
- Windows 批次資料夾上傳的相對遠端路徑統一為 POSIX separator，避免反斜線進入 remote task path。

## v0.6.2

### 改善
- 減少重複的遠端資料夾存在檢查：快取已確認的資料夾，並合併同一資料夾正在進行中的檢查。
- 讓 watcher 快取更新順序可預期：將未等待完成的 async iteration 改為逐一等待每個設定處理完成。
- 快取已編譯的 ignore 規則，並在遞迴掃描本地檔案時重複使用。
- 對動態上傳並行數探測加入頻率限制，並依設定重用正在進行中的探測。
- 依 server/config 快取成功的 FTP 檔案修改時間同步指令策略；快取策略失敗時會回退到完整探測。
- 更新正式環境依賴並鎖定有風險的傳遞依賴；正式依賴安全稽核目前為零漏洞。

### 修正
- 將宣告的 Log 語言設定與 grammar 正確納入 VSIX 套件。
- 修正 Windows 上反向 ignore 規則解析至錯誤路徑或工作區外的問題，並支援精確檔案還原。
- 依 config 與 workspace 序列化 watcher cache 的讀取、合併與寫入，避免快速事件造成更新遺失。

### 變更
- `npm test` 現在執行有限次的 typecheck 與單元測試流程，不再使用原本的 watch-mode compile pretest。
- 最低支援 VS Code 由 1.73 提升至 1.82，Extension Host 型別同步改為 Node 18.15。
- TypeScript 更新至 5.9.3、更新 Node 18 型別，並修正較嚴格的快取鍵值型別檢查。
- CI Extension Host 測試同時覆蓋 VS Code 1.82 與目前 Stable。
- ESLint 遷移至 flat config，並更新至 ESLint 9.39.4 與 typescript-eslint 8.61.1。
- 更新 Mocha 11.7.6、webpack-cli 7.0.3 與 javascript-obfuscator 5.4.3；production build 改用 webpack 支援的 `--mode production`。

### 新增
- 新增 P0 complexity baseline 測試架構，包含 Mocha、TypeScript 測試編譯與 VS Code API mock。
- 新增遠端資料夾確認、watch-cache merge 行為，以及 ignore-rule traversal 行為的聚焦基準測試。
- 新增 VS Code 1.82 Extension Host 實機整合測試，驗證宣告的最低支援版本。

## v0.6.1

### 修正
- Windows 上 SFTP 路徑遍歷 bug：`path.join` 在遠端路徑中產生反斜線，導致檔案上傳至錯誤目標。所有遠端路徑構建改用 `path.posix.join` + `posixRelative()` 工具函式。
- 重複上傳事件：`onDidSaveTextDocument` 和 `onDidChange` 可能同時觸發同一檔案的上傳。
- 資料夾重命名同步問題：重命名本地資料夾時，不再重新上傳整個資料夾內容，改為直接在遠端執行 `rename` 指令。
- 連線池清理邏輯 Bug：`startCleanupTimer` 中使用了 `return` 而非 `continue`，導致任一忙碌的 queue 會阻止其他閒置 queue 的連線池清理。
- `uploadOnSave` 不必要地預先取得 client 連線（所有分支都透過 `FileTransfer.addTask` 自行管理連線）。
- `uploadFile` 使用 `new Promise(async ...)` 反模式，可能靜默吞掉未處理的例外；已重構為直接 `async` 函式。
- `uploadFile` SFTP 分支建立了 `ReadStream` 僅用於取得 `.path` 屬性，但未消費也未關閉 stream；改為直接使用檔案路徑。
- `treeProvider.ts` 中 8 個 `iconPath` 的 `string → Uri` 型別錯誤（使用 `vscode.Uri.file()` 包裝）。
- `treeProvider.ts` 中 8 個 `l10n.t()` 呼叫的 overload 不匹配問題（陣列參數改為展開傳入）。
- FTP 空檔案上傳副作用：原本直接在本地檔案寫入空格字元，導致檔案內容被修改；改用暫存檔（`.ftp_tmp`）上傳，上傳後自動清理。

### 改善
- 重新命名 `skipIfSameSize` → `skipIfSame`（向後相容——舊設定自動遷移）。
- 跳過邏輯：檔案跳過時只輸出 `[skipUpload]`，不再顯示多餘的 `[upload]` 行。
- 錯誤捕捉 (Error Handling)：為所有空 `catch` 區塊加上語意明確的註解說明。
- 日誌系統：將所有 `console.log` / `console.error` / `console.warn` 統一替換為 `oConsole.*`（可由設定控制是否輸出）。
- 移除 `shouldSkipUpload()` 中 `skipIfSameSize` 的死碼 fallback（設定遷移已於讀取時完成）。
- 連線池穩健性強化：`cleanupConnectionPool` 加入 `maxIdle` 上限及 try-catch 保護；`releaseClient` 超出 `maxConnections` 時直接關閉連線；所有 `close()`/`end()` 均以 try-catch 包裹。
- 將 `.vscode/` 加入 `.gitignore`。

### 新增
- `skipCompareMode` 設定：可選比對標準 — `"size+mtime"`（預設）、`"size"`、`"mtime"`。

## v0.6.0

### 修正
- SFTP 檔案時間同步，透過底層 ssh2 `utimes` 呼叫與 `exec touch` 回退機制。
- Windows 建置相容性（`package` 腳本、webpack ts-loader `transpileOnly`）。
- MOVE/rename 在 Windows 路徑分隔符情境下只上傳新檔、不移動遠端舊檔的問題；現在會正確執行遠端 rename。
- `uploadDelay` 行為為真正防抖：最後一次修改後延遲 N 秒才上傳，避免頻繁修改時重複上傳。

### 改善
- 調整認證流程：`sftp/ssh` 優先使用 `privateKeyPath`，不可用時回退 `password`。
- 補回 `privateKeyPath` 與 `secretKeyPath` 至預設設定範本與範例生成內容。
- 更新所有 13 種語系的設定範本。

### 變更
- 同步認證優先序與執行期錯誤訊息至所有語系 README。
- 同步 Build 指令說明到所有語系 README。

### 新增
- `syncFileTime` 設定，支援上傳後同步遠端檔案時間（FTP/SFTP/SSH）。
- `skipIfSameSize` 設定，上傳前比對遠端檔案大小與修改時間，相同則跳過（預設 true）。
- `uploadDelay` 設定，最後一次修改後延遲指定秒數再上傳（防抖；預設 0，即時上傳）。
- 明確驗證錯誤訊息（FTP 僅支援密碼、私鑰路徑無效且無密碼等情境）。

## v0.4.0
重構專案，支援多語言、多種連線方式與更多實用功能。

## v0.2.7
支援壓縮後可選擇遠端解壓，並可刪除遠端上傳壓縮檔。

## v0.2.4
支援代理。

## v0.2.0
新增下載檔案。

## v0.1.0
新增國際化。

## v0.0.5
體驗優化。

## v0.0.3
版本發布。
