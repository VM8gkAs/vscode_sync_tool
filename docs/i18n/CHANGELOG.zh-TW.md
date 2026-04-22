# 更新日誌

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

### 新增
- `skipCompareMode` 設定：可選比對標準 — `"size+mtime"`（預設）、`"size"`、`"mtime"`。

### 改善
- 重新命名 `skipIfSameSize` → `skipIfSame`（向後相容——舊設定自動遷移）。
- 跳過邏輯：檔案跳過時只輸出 `[skipUpload]`，不再顯示多餘的 `[upload]` 行。
- 錯誤捕捉 (Error Handling)：為所有空 `catch` 區塊加上語意明確的註解說明。
- 日誌系統：將所有 `console.log` / `console.error` / `console.warn` 統一替換為 `oConsole.*`（可由設定控制是否輸出）。
- 移除 `shouldSkipUpload()` 中 `skipIfSameSize` 的死碼 fallback（設定遷移已於讀取時完成）。
- 連線池穩健性強化：`cleanupConnectionPool` 加入 `maxIdle` 上限及 try-catch 保護；`releaseClient` 超出 `maxConnections` 時直接關閉連線；所有 `close()`/`end()` 均以 try-catch 包裹。
- 將 `.vscode/` 加入 `.gitignore`。

## v0.6.0

### 新增
- `syncFileTime` 設定，支援上傳後同步遠端檔案時間（FTP/SFTP/SSH）。
- `skipIfSameSize` 設定，上傳前比對遠端檔案大小與修改時間，相同則跳過（預設 true）。
- `uploadDelay` 設定，最後一次修改後延遲指定秒數再上傳（防抖；預設 0，即時上傳）。
- 明確驗證錯誤訊息（FTP 僅支援密碼、私鑰路徑無效且無密碼等情境）。

### 修正
- SFTP 檔案時間同步，透過底層 ssh2 `utimes` 呼叫與 `exec touch` 回退機制。
- Windows 建置相容性（`package` 腳本、webpack ts-loader `transpileOnly`）。
- MOVE/rename 在 Windows 路徑分隔符情境下只上傳新檔、不移動遠端舊檔的問題；現在會正確執行遠端 rename。
- `uploadDelay` 行為為真正防抖：最後一次修改後延遲 N 秒才上傳，避免頻繁修改時重複上傳。

### 改善
- 調整認證流程：`sftp/ssh` 優先使用 `privateKeyPath`，不可用時回退 `password`。
- 補回 `privateKeyPath` 與 `secretKeyPath` 至預設設定範本與範例生成內容。
- 更新所有 13 種語系的設定範本。

### 文件
- 同步認證優先序與執行期錯誤訊息至所有語系 README。
- 同步 Build 指令說明到所有語系 README。

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
