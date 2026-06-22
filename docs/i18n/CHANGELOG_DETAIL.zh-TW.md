# 詳細變更追蹤（繁體中文）

> 用於記錄每次版本的詳細改動，便於後續追蹤、回溯與驗證。

## v0.6.2（2026-06-21）

### 改善項目
- **遠端資料夾確認快取**：`FileTransfer.checkExistFolder()` 會快取已確認存在的遠端資料夾，並合併同一資料夾正在進行中的檢查，降低大量檔案上傳時的重複遠端 metadata 查詢。
- **watcher 快取更新順序**：`saveChangeFile()` 將未等待完成的 async `forEach` 改為逐一等待處理，讓 watch-cache merge 的順序與完成時機更可預期。
- **watcher 快取序列化**：相同 config/workspace 的 workspaceState read/merge/write 會依序執行，避免快速連續事件互相覆寫。
- **ignore 規則快取**：`getAllowFiles()` / `getAllFiles()` 重用已編譯的 ignore matcher，避免大量檔案 traversal 時重複編譯規則與重複讀取設定。
- **動態並行探測頻率限制**：`addMaxConcurrency()` 依 config 重用正在進行中的探測，並加入冷卻時間，避免 task 高峰期重複建立測試連線。
- **FTP 檔案時間同步策略快取**：成功的 FTP mtime 指令策略會依 server/config 快取；若快取策略失敗，會清除快取並回退到完整探測。
- **依賴安全性**：更新正式依賴並透過 pnpm overrides 鎖定安全的傳遞版本；production audit 為零漏洞。

### 修正項目
- **VSIX Log grammar**：將 Log language configuration 與 TextMate grammar 移至 `package.json` 宣告的 `log/` 路徑，並確認發布清單包含兩個檔案。
- **Windows 反向 ignore 路徑**：改用 workspace-root 相對解析，拒絕跳出 workspace 的規則，並支援精確檔案還原。

### 變更項目
- **測試流程**：`npm test` 現在執行有限次的 typecheck 與 Mocha 單元測試，不再透過 watch-mode compile pretest 卡住流程。
- **TypeScript 與 Extension Host 型別**：TypeScript 更新至 5.9.3，VS Code 型別固定在 1.82.0，Node 型別維持 18.x。
- **Lint 工具鏈**：遷移至 `eslint.config.cjs` flat config，更新 ESLint 至 9.39.4、typescript-eslint 至 8.61.1。
- **Build／test 工具鏈**：更新 Mocha 至 11.7.6、webpack-cli 至 7.0.3、javascript-obfuscator 至 5.4.3；正式建置改以 `--mode production` 啟用混淆。

### 功能新增
- **P0 complexity baseline 測試架構**：新增 Mocha、TypeScript test compile、VS Code API mock，以及測試輸出目錄設定。
- **聚焦基準測試**：新增遠端資料夾確認、watch-cache merge 行為、ignore-rule traversal、並行探測限流與 FTP mtime 策略快取的測試覆蓋。

### 實作細節
- `package.json`：新增有限次測試流程與測試編譯腳本。
- `tsconfig.test.json`、`tests/setup/vscodeMock.ts`、`tests/**`：新增測試編譯與 mock fixtures。
- `src/watchCache.ts`：抽出 watch-cache merge 邏輯，並新增 keyed async queue 防止並行覆寫。
- `src/FileTransfer.ts`：新增遠端資料夾確認快取、in-flight dedupe、並行探測限流，以及 FTP mtime 策略快取。
- `src/extension.ts`：改為等待每個 config 的 watcher 更新流程。
- `src/utils.ts`：新增 ignore matcher 快取、精確檔案 traversal 與安全的 negated-rule 路徑解析。
- `log/**`：放置 VSIX 實際引用的 Log 語言設定與 grammar。
- `pnpm-workspace.yaml`：鎖定正式依賴的安全傳遞版本。

### 文件更新
- `CHANGELOG.md`：依 `Fixed` → `Improved` → `Changed` → `Added` 順序整理。
- `docs/i18n/CHANGELOG.zh-TW.md`：同步下一版本內容與分類順序。
- `docs/i18n/CHANGELOG_DETAIL.zh-TW.md`：新增下一版本詳細追蹤。
- `docs/archive/complexity-report-2026-05-25.md`：保留 P0/P1/P2 完成狀態與剩餘 P3 的歷史分析快照。
- `docs/REPORT.md`：作為唯一持續更新的程式改進路線圖。

### 驗證結果
- `npm test`：18 passing。
- `npm run typecheck:strict`：通過。
- `npm run lint`：0 errors（仍有既有 warnings）。
- `npm run package`：webpack compiled successfully。
- `pnpm audit --prod`：0 vulnerabilities。

## v0.6.1（2026-03-27）

### 修正項目
- **路徑遍歷 bug**：Windows 上使用 `path.join` 構建遠端路徑時產生反斜線（`\`），經 `getNormalPath` 轉換後導致雙斜線 `//root/WLB/...`，或路徑遍歷 `/../../Program Files/...` 上傳到錯誤位置。
  - 所有遠端路徑構建統一改用 `path.posix.join`。
  - 新增 `posixRelative(from, to)` 工具函式，封裝 `path.relative().split(path.sep).join('/')`，消除 15 處重複代碼。
- **重複上傳**：`onDidSaveTextDocument` 和 `onDidChange` 同時觸發可能導致同一檔案上傳兩次。
- **資料夾重命名同步問題**：重命名本地資料夾時，VS Code 的 FileSystemWatcher 會對資料夾內每個子檔案觸發 `onDidCreate` / `onDidChange` 事件，導致整個資料夾被重新上傳而非執行遠端 rename。
  - 新增 `renamingFolderPrefixes` (Set) 用於存儲重命名中的資料夾路徑前綴。
  - 新增 `isInRenamingFolder()` 輔助函式，使用 `startsWith` 判斷子路徑。
  - 在 `onDidCreate` 與 `onDidChange` 事件中加入過濾邏輯。
  - 10 秒後自動清除前綴記錄，避免記憶體洩漏。
- **連線池清理 Bug**：`startCleanupTimer` 的 `for...of` 迴圈中，當某個 queue 的任務數不為 0 時使用 `return` 直接退出整個 `setInterval` callback，導致後續其他已閒置的 queue 的連線池也不會被清理。
  - 修正：將 L277 的 `return` 改為 `continue`。
- **`uploadOnSave` 預先 getClient 浪費**：`uploadOnSave.ts` L16 立即呼叫 `getClient` 取得連線，但所有分支（add/edit/rename/delete）都只透過 `FileTransfer.addTask()` 排入佇列，佇列內會自行取得 client。導致連線被取出後立即放回，造成不必要的連線競爭。
  - 修正：移除預先 `getClient` 及 `finally` 中的 `releaseClient`。
- **`uploadFile` async executor 反模式**：`uploadFile` 使用 `return new Promise(async (resolve, reject) => {...})`，這是已知的 async executor anti-pattern——若 executor 內拋出未被 try-catch 攔截的錯誤，Promise 不會被 reject 而是靜默吞掉例外。
  - 修正：將 `new Promise` 包裝移除，改為直接 `async` 函式。
- **`uploadFile` ReadStream 資源洩漏**：SFTP 分支建立了 `fs.createReadStream(task.localPath)` 僅用於取得 `.path` 屬性，stream 本身從未被消費也未被關閉。
  - 修正：移除 `createReadStream`，直接使用 `task.localPath`。
- **`treeProvider.ts` 型別錯誤**：
  - 8 個 `iconPath` 的 `{ light, dark }` 屬性值由 `string` 改為 `vscode.Uri.file()`。
  - 8 個 `l10n.t()` 呼叫的陣列參數 `[a, b]` 改為展開形式 `a, b`。
  - `refreshCount()` 中 `v.label` (可能為 `TreeItemLabel | undefined`) 以 `String(v.label ?? '')` 轉型。
- **FTP 空檔案上傳副作用**：FTP 協定不允許上傳 0 位元組檔案，原實作直接在本地檔案寫入一個空格字元（`fs.writeFileSync(localPath, " ")`），導致：(1) 本地檔案內容被修改，(2) `skipIfSame` 比對失效。
  - 修正：改用暫存檔（`localPath + '.ftp_tmp'`）寫入空格字元後上傳，上傳完畢後在 `finally` 區塊以 `fs.unlinkSync` 清理暫存檔。本地原始檔案不再被修改。
- **編譯錯誤**：`FileTransfer.ts` 中 14 處 `console.log` 被替換為 `oConsole.log`，但遺漏了 import，導致 TS2304 錯誤。

### 改善項目
- **`skipIfSame` 命名調整**：取代 `skipIfSameSize`，以更精確反映語義。舊設定 `skipIfSameSize` 自動遷移，無需手動修改。
- **跳過日誌改善**：檔案跳過時只輸出 `[skipUpload]` 一行，不再先顯示 `[upload]` 再顯示 `[skipUpload]`。
  - 實作方式：將 `shouldSkipUpload()` 檢查提前至 `executeTask` 中 `addTaskLog()` 之前執行。
- **錯誤捕捉 (Error Handling)**：
  - `FileTransfer.ts` 中 5 處空 catch 區塊加上語意明確的英文註解。
  - `treeProvider.ts` 中 `clearFileCache` 的空 catch 區塊補上註解。
- **日誌系統**：所有 `console.log` / `console.error` / `console.warn` 統一替換為 `oConsole.*`：
  - `extension.ts`：5 處
  - `treeProvider.ts`：3 處
  - `deploy.ts`：1 處
  - `CodeLensProvider.ts`：2 處
  - `FileTransfer.ts`：26 處
- **死碼清理**：`shouldSkipUpload()` 中的 `(config as any).skipIfSameSize` fallback 永遠不會觸發（config migration 已在 `utils.ts` 讀取設定時完成轉換），予以移除。
- **冗餘日誌移除**：`syncRemoteFileTime` 中的 `console.warn` 與 `logSyncFileTime` 功能重複，移除 `console.warn`。
- **連線池穩健性強化**：
  - `cleanupConnectionPool` 新增 `maxIdle` 參數（預設 `Infinity`），超出限制的閒置連線從佇列頭端移除並關閉。
  - 所有 `client.close()` / `client.end()` 呼叫均包裹 try-catch，防止清理已斷線連線時拋錯導致整個清理流程中斷。
  - `releaseClient` 在連線池已滿（`>= maxConnections`）時直接關閉連線而非放回池中，避免池無限膨脹。
- **`.vscode/` 加入 `.gitignore`**。

### 功能新增
- **`skipCompareMode`**：新增比對標準設定，可選值：
  - `"size+mtime"`（預設）— 檔案大小與最後修改時間都相同才跳過
  - `"size"` — 僅比對檔案大小
  - `"mtime"` — 僅比對最後修改時間

### 實作細節
- `src/utils.ts`：新增 `posixRelative()` 工具函式（匯出）。
- `src/deploy.ts`：7 處 `path.join` → `path.posix.join` + `posixRelative()`；`console.log` → `oConsole.log`。
- `src/events/uploadOnSave.ts`：4 處路徑修正 + `else` 分支 `path.relative` → `path.posix.join`；移除預先 `getClient` 及 `releaseClient`。
- `src/extension.ts`：
  - 新增 `renamingFolderPrefixes` Set 變數。
  - 新增 `isInRenamingFolder()` 函式。
  - `onWillRenameFiles` 中增加資料夾前綴記錄邏輯。
  - `onDidCreate` / `onDidChange` 中增加 `isInRenamingFolder()` 過濾。
  - `generateRemotePath` 路徑修正。
  - import 加入 `oConsole`、`posixRelative`。
- `src/FileTransfer.ts`：
  - `startCleanupTimer()`：L277 `return` → `continue`。
  - `shouldSkipUpload()`：支援 `skipIfSame` + `skipCompareMode`；移除 `skipIfSameSize` fallback。
  - `uploadFile()`：移除 `new Promise(async ...)` 包裝；移除多餘 `ReadStream`。
  - `executeTask` 中 upload 操作在 `addTaskLog` 前先執行 `shouldSkipUpload` 檢查。
  - `downloadFilesFromFTP/SFTP` 的遠端路徑改用 `path.posix.join`。
  - `syncRemoteFileTime()`：移除冗餘 `console.warn`。
  - `cleanupConnectionPool()`：新增 `maxIdle` 參數；所有 `close()`/`end()` 加上 try-catch 保護。
  - `releaseClient()`：超出 `maxConnections` 時直接關閉連線。
  - `uploadFile()` FTP 分支：空檔案改用暫存檔（`.ftp_tmp`）上傳，`finally` 區塊清理暫存檔。
  - 26 處 `console.*` → `oConsole.*`；import 加入 `oConsole`。
- `src/treeProvider.ts`：import 加入 `oConsole`；`iconPath` 改用 `vscode.Uri.file()`；`l10n.t()` 改為展開傳入。
- `src/CodeLensProvider.ts`：import 加入 `oConsole`；`console.*` → `oConsole.*`。
- `src/types/config.ts`：新增 `skipIfSame`、`skipCompareMode`，保留 `skipIfSameSize`（已棄用標記）。
- `src/config/default.ts`：更新模板與 SCHEMA_FIELDS。
- `.gitignore`：新增 `.vscode/`。

### 文件更新
- `CHANGELOG.md`：合併 v0.6.1~v0.6.3 為 v0.6.1。
- `docs/i18n/CHANGELOG.zh-TW.md`：合併 v0.6.1~v0.6.3 為 v0.6.1。
- `docs/i18n/CHANGELOG_DETAIL.zh-TW.md`：合併 v0.6.1~v0.6.3 為 v0.6.1 詳細追蹤。
- `CHANGELOG.en.md`：已刪除（內容併入 `CHANGELOG.md`）。
- `README.md`：設定範例更新 `skipIfSame` + `skipCompareMode`。
- 版本號更新為 `0.6.1`（package.json）。

### 驗證結果
- `npx tsc --noEmit`：零錯誤
- `npm run package`：webpack compiled successfully

## v0.6.0（2026-02-24）

### 修正項目
- 修正 SFTP `utimes` 無法設定檔案時間：`ssh2-sftp-client` 封裝器未暴露 `utimes` 方法，且 `config.type === 'sftp'` 跳過了 SSH touch 分支。
- 修正 `zh-tw` 語系模板使用了錯誤的 `exampleZhText`（應為 `exampleTwText`）。
- 修正 `syncFileTime` 設定在新建 config 時未出現的問題（utils.ts 預設回退）。
- 修正 Windows 建置失敗（`NODE_ENV=production` → `--node-env production`）。
- 修正認證流程為 `privateKeyPath` 優先，並在私鑰不可用時回退 `password`（限 `sftp/ssh`）。
- 修正預設範本遺漏 `privateKeyPath`、`secretKeyPath` 欄位的問題。
- 新增明確驗證錯誤訊息：FTP 密碼必填、私鑰路徑不存在且密碼為空、未配置任何認證資訊。
- 修正 MOVE/rename 在 Windows 下未同步遠端舊路徑的問題：原本可能退回成「僅上傳新位置」，導致遠端舊檔殘留。
- 修正 `uploadDelay` 行為描述與實際邏輯不一致：現在明確採用「最後一次修改後延遲 N 秒上傳」的防抖模式。

### 功能新增
- 新增 `syncFileTime` 設定（預設 `false`）。
  - 上傳完成後可依本機檔案時間同步遠端時間。
  - FTP：嘗試 MFMT / SITE MFMT / MDTM / SITE UTIME / SITE TOUCH 等多種指令，逐一嘗試。
  - SFTP：使用底層 ssh2 `sftp.utimes()` 設定 atime/mtime，失敗則回退至 `exec touch -m -d @epoch`。
  - SSH：使用 `touch -m -d @epoch` 設定檔案時間。
  - 包含驗證與校正機制：設定時間後讀回並比對，若差距 >1 秒則自動修正。
- 新增 `skipIfSameSize` 設定（預設 `true`）。
  - 上傳前檢查遠端檔案大小和修改時間，兩者皆與本地相同則跳過上傳。
  - FTP：使用 `client.size()` + `client.lastMod()` 取得遠端檔案資訊。
  - SFTP/SSH：使用 `client.stat()` 取得 size 與 modifyTime。
  - 跳過時在輸出面板記錄 `[skipUpload]` 日誌。
- 新增 `uploadDelay` 設定（預設 `0`，即時上傳）。
  - 最後一次修改後延遲指定秒數再觸發上傳（防抖），僅影響 `upload_on_save` 模式。

### 實作細節
- `src/FileTransfer.ts`：
  - 新增 `shouldSkipUpload()` 方法：比對本地/遠端檔案大小與 mtime。
  - 新增 `applyRemoteFileTime()` SFTP 分支：透過 `client.sftp.utimes()` + `client.exec()` 雙層回退。
  - 新增 `getRemoteFileTime()` SFTP exec 回退：`stat -c %Y` 指令。
  - 新增 `logSyncFileTime()` 方法：將診斷資訊輸出至 VS Code 輸出面板。
  - `uploadFile()` 中在實際上傳前加入 `shouldSkipUpload()` 檢查。
- `src/extension.ts`：
  - `saveChangeFile()` 中 `upload_on_save` 分支加入 `uploadDelay` 延遲邏輯。
  - `upload_on_save` 改為可取消舊計時器的排程機制（同設定 + 同檔案僅保留最後一次觸發），實現真正 debounce。
- `src/types/config.ts`：新增 `skipIfSameSize?: boolean`、`uploadDelay?: number`。
- `src/config/default.ts`：所有 13 種語系模板補上 `syncFileTime`、`skipIfSameSize`、`uploadDelay`。
- `src/utils.ts`：`setDefaultConfig()`、`selectConfig()`、`getUserConfig()` 三處補上預設值。
- `webpack.config.js`：ts-loader 加入 `transpileOnly: true`。
- `src/FileTransfer.ts`：
  - 在 `renameFile()` 中，針對非 FTP 連線先將 `oldPath/newPath` 正規化為 POSIX 路徑（`/`）。
  - 避免 Windows `\\` 分隔符造成 `client.exists(oldPath)` 誤判不存在，進而錯誤走到上傳回退分支。

### 文件更新
- `docs/i18n/README.zh-TW.md`：功能清單新增 3 項，設定範例加入新欄位。
- `README.md`：功能清單新增 3 項，設定範例加入新欄位。
- `CHANGELOG.md`、`docs/i18n/CHANGELOG.zh-TW.md`：新增 v0.6.0 條目。
- 版本號更新為 `0.6.0`（package.json）。
- `README.md` 與 `docs/i18n/README.*.md`：新增「認證優先序與驗證錯誤訊息」段落，說明 `privateKeyPath` / `password` 規則與執行期錯誤。
- `docs/i18n/README.*.md`：補充 Build 指令區塊（安裝、watch、production build、VSIX 打包）。

---

## 範本（複製用）

```md
## vX.Y.Z（YYYY-MM-DD）

### 修正項目
- 待補

### 改善項目
- 待補

### 變更項目
- 待補

### 功能新增
- 待補

### 實作細節
- 待補

### 文件更新
- 待補

### 驗證結果
- 待補
```
