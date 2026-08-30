# 詳細變更追蹤（繁體中文）

> 用於記錄每次版本的詳細改動，便於後續追蹤、回溯與驗證。

## 下一版本

### 2026-08-30 P3-1～P3-5 完成
- **拖曳與遠端移動**：本機拖曳支援 LF／CRLF URI 清單、取消與 POSIX 遠端路徑；遠端節點移動限制同一 config/workspace scope，禁止資料夾移入自身，不覆寫既有目的地，並保證 client 只釋放一次。
- **同步終態**：`completed`、`failed`、`cancelled`、`stopped` 統一由 finalize 發布至 Tree View、Status Bar 與 UI event；使用者可見文字均已本地化。
- **SSH 自動解壓縮安全**：先確認遠端提供 `unzip`，再列出 ZIP 項目並拒絕絕對路徑、Windows 磁碟機路徑與 `..` 上層穿越；archive／destination 以單一 POSIX shell 參數引用，任何非零 exit code 都保留錯誤內容。
- **SSH 遠端右鍵解壓縮**：只有 SSH `.zip` 節點顯示命令，確認覆寫風險後解壓縮至壓縮檔所在目錄；成功後刷新父節點，失敗保留結構化診斷。
- **單檔差異檢視**：Tree View 與 Explorer 都拒絕資料夾、重新下載遠端副本、等待 `vscode.diff`，並統一本機檔案在左、遠端檔案在右。
- **驗證**：聚焦測試涵蓋取消、跨工作區、碰撞、自身移動、ZIP 路徑注入／穿越、能力與 exit code、終態 UI，以及 fresh remote diff；102 passing、strict typecheck、source-aware i18n、lint、production build、audit 0、VS Code 1.82／Stable 1.135.0 與暫存 VSIX（58 files、2.33 MiB；bundle 6.84 MiB）均通過。
- **暫存 VSIX SHA-256**：`0C8B6228AA917E45433F645F3DCDF1F0A291D43C9D60A54805294F78AF70C3DD`。

### upstream `390af0d` 選擇性整合
- **已整合**：移除 extension expiration gate；新增外部配置儲存、選擇／重置命令與自動遷移。
- **multi-root 改寫**：路徑使用 workspace 絕對路徑的 8 字元 SHA-256 前綴形成 `<專案>-<雜湊>` 目錄，同名 workspace 不共用設定。
- **資料安全**：只接受所有 workspace 外的絕對目錄；先複製、成功更新設定後才移除來源，取消不改位置，既有目標永不覆寫。
- **失敗回復**：複製或全域設定更新失敗時會移除已暫存目標、保留全部來源並顯示本地化錯誤，不會讓 activation 因搬移 I/O 錯誤中止。
- **cache／編輯整合**：外部設定儲存後會清除 workspace-scoped config cache、關閉舊連線並更新 Tree；在 VS Code 儲存外部 `sync_config.jsonc` 也會重載。
- **未整合**：`.cursor/rules/pchat.mdc`、生成的 `types/`／copy 檔、upstream `0.5.1` metadata，以及未經本專案測試的 vendored `ssh2-sftp-client` 改寫。
- **驗證**：新增 5 項外部設定儲存測試，合計 80 passing；strict typecheck、source-aware i18n、lint、production build、audit 0、VS Code 1.82／Stable 1.135.0 與暫存 VSIX（58 files、2.35 MiB）均通過；bundle 為 6.93 MiB。
- **暫存 VSIX SHA-256**：`C5018C8DEA29ADDAF16D4CFD69E1903F8E6FB5F480C89CFD38F2806026D44AF3`。

## v0.6.3（2026-07-17）

### 2026-08-30 P1 本地化與 Workspace Trust 收尾
- **Workspace Trust**：未信任工作區無法執行 `sync_config.jsonc` 提供的 `config.build` shell command；提示可開啟信任管理，並要求信任後重新啟動同步。
- **非同步邊界**：`Deploy.start()` 與 `getIgnoreConfig()` 不再使用 async Promise executor；取消、throw 與 ignore cache 讀寫錯誤會正常 settled。
- **本地化**：核心使用者訊息改用 VS Code l10n，Build／建置術語統一；高頻重複 debug／進度 log 已移除，技術資訊使用固定結構化標籤。
- **i18n gate**：除語系集合與缺少／額外 key 外，現在也會掃描 `src/**/*.ts` 的 literal l10n key，攔截原始碼引用但基準 bundle 缺少的項目。
- **驗證**：新增 build 成功／失敗、untrusted prompt cancellation、Deploy cancellation 及 ignore cache read/write failure 聚焦測試；75 tests、strict typecheck、source-aware i18n、lint、production build、audit 0、VS Code 1.82／Stable 1.135.0 與 58 files／2.37 MiB VSIX 均通過。
- **VSIX SHA-256**：`F3F6438100AD1DF9A5B610171F9089567DF43B6BC450F476C729CE54EBED3DB9`。

### 2026-08-30 watch 資料夾上傳路徑修正
- **現象**：watch 模式記錄資料夾新增後，執行同步時，子檔可能以父目錄作為遠端目的地；例如本機 `html/wordcloud/lib/pocketbase.umd.js` 被送往 `/volumes/html/wordcloud/lib`，造成 SFTP `fastPut: Failure` 並保留錯誤任務。
- **根因**：`Deploy.uploadFile()` 展開待上傳資料夾後，重用了資料夾事件的 `remotePath`，沒有按每個子檔重新附加 workspace-relative suffix。
- **修正**：統一本機基準與遠端基準，每個展開後的檔案都獨立計算完整遠端路徑；一般 workspace-root 與 `upload_to_root` 模式共用同一套計算。
- **設定說明**：`watch: true` 且 `upload_on_save: false` 只收集「待上傳」變更，仍需執行同步；需要儲存後立即上傳時應使用 `upload_on_save: true`。
- **依賴安全性**：因應 2026 年 8 月新公告的 `ip-address` SSRF／trust-boundary bypass 漏洞，`socks` 的傳遞版本覆寫為 10.3.1；production audit 恢復為零已知漏洞。
- **驗證**：新增 Windows 本機路徑與 SFTP 遠端路徑回歸案例；69 passing、strict typecheck、i18n、lint error gate、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.135.0 Extension Host 均通過。

### 2026-07-31 實測回歸修正
- **`tools/**` 目錄根事件**：Minimatch 可命中 `tools` 內的檔案，但原 matcher 未將尾端 `/**` 的 literal root 視為同一排除範圍；現在 `tools` 與其所有 descendants 都會在 watcher policy gate 被排除。
- **瞬間消失的 watcher path**：`onDidChange` 的 `lstatSync()` 現在會安全處理 ENOENT，避免 rename／delete 競態把不存在路徑回報成同步錯誤。
- **資料夾新增後立即改名**：舊路徑的 pending upload task 若已失效，會在取得 client 前完成；若路徑在 dispatch 後才消失，也會在任何 remote parent mutation 前結束。
- **遠端重複目錄根因**：舊流程先建立遠端父目錄，再對已被改名的本機來源執行 `stat`，因此 retry 會留下舊目錄；現在先確認本機來源，再允許建立遠端路徑。
- **依賴安全性**：因 2026 年 7 月新增的 `brace-expansion` advisories，傳遞版本統一覆寫為 5.0.9；production audit 為零已知漏洞，且 VS Code 1.82 Extension Host 驗證通過。
- **完整驗證**：新增 globstar directory-root、stale upload 與 remote-parent mutation 回歸案例；68 passing、strict typecheck、i18n、lint error gate、production build、production audit、VS Code 1.82／Stable 1.131.0 Extension Host 與 VSIX 實包均通過。

### 發行摘要
- 完成 P0 正確性收尾、P1 型別／Git 安全邊界與 P2 效能改善，並保留 VS Code 1.82 最低執行版本。
- Output 成功記錄不再於 queue finalize 後消失；使用者可選擇寫入工作區相對檔案 log。
- 高延遲遠端與大型本機 workspace 的 traversal 都加入有界非同步處理，並提供可降低負載或恢復舊版序列遠端行為的設定。

### 功能新增
- **檔案 log**：新增 `SyncTools.logToFile`（預設 `false`）與 `SyncTools.logDirectory`（預設 `sync_logs`）。啟用後依 workspace append 至 `sync-tools.log`，並維持同一 workspace 的寫入順序。
- **log 路徑邊界**：自訂目錄只能是工作區內的非空相對路徑；絕對路徑、`..` 越界與 workspace root 都會被拒絕，啟用的 log 目錄也會加入 upload ignore。
- **本機 traversal 設定**：每個環境可設定 `localTraversalConcurrency`（1–16，預設 4）；設為 1 使用最低瞬時磁碟負載的非阻塞序列 I/O。
- **遠端 traversal 設定**：每個環境可設定 `downloadTraversalConcurrency`（1–16，預設 2）；設為 1 會走舊版 FTP/SFTP 序列 DFS。

### 正確性與安全修正
- **Queue finalize**：successful、failed、cancelled、stopped、skipped 與 empty deployment 統一進入 config/workspace-scoped finalize；finalize 可重入但只執行一次，且成功路徑不覆蓋失敗診斷。
- **Output retention**：成功 finalize 不再呼叫全域 log clear；Output 只在使用者執行 Clear All Log 或超過 `SyncTools.logNumberLimit` 時移除最舊記錄。
- **Watcher ignore policy gate**：rename/move 事件會在排程與 cache 寫入前同時檢查 `oldPath`、`newPath`：未排除→已排除轉為 delete、已排除→未排除轉為 add、兩端都排除則 skip。
- **rename/move 分類**：父目錄相同標記為 `rename`，父目錄不同標記為 `move`；底層仍使用 FTP/SFTP 相容的 remote rename，Output 依 `pathChangeType` 顯示操作類型。
- **Multi-root scope**：config cache、queue、connection pool、watch cache、debounce、Tree node、暫存檔與 `.gitignore` cache key 都包含 workspace root，不再猜第一個 workspace。
- **Git submit**：改用 `execFile("git", args)` 依序執行 add、staged diff、commit、push；commit message 不進入 shell 字串，並區分 no changes、authentication 與 push failure。
- **Client retry**：client 歸還 connection pool 後立即清除本地參照，retry 無法重連時不會再次 release 同一 client。
- **Tree refresh**：完成事件會等待 Tree node 更新後才釋放 mutex；空部署也會完成 UI／Status Bar 收尾。
- **Windows remote path**：批次資料夾上傳的相對路徑統一使用 POSIX separator，不讓本機反斜線進入遠端 task path。
- **發行閘門**：修正 CI lint 參數轉送，Stop Sync command 改用正確 l10n key；所有 package.nls 語系 key 已一致。

### 效能與資源改善
- **Watch cache**：建立 `newname -> source keys` 索引，並將同 config/workspace 的 50 ms burst 合併為一次 workspaceState read/update；部署、清除與 deactivate 前都有 flush barrier。
- **本機 traversal**：`getAllFiles()` 改用 `fs.promises.lstat` 與 `readdir({ withFileTypes: true })`，保留 ignore pruning、negation restore、symlink 與穩定輸出順序。
- **遠端 traversal**：FTP/SFTP directory discovery 使用有界並行與穩定 DFS task order；任一 list 失敗時不 enqueue 部分結果，額外 traversal lease 與 transfer 共用連線上限。
- **Deadlock 防護**：共享 connection budget 沒有空額度時立即沿用既有 client，不等待另一個 traversal 釋放 lease。
- **Tree cache**：node index 改為 `Map`，refresh／delete／rename／disconnect 共用 iterative subtree eviction；完成事件以 50 ms 視窗批次排序與 refresh。
- **非阻塞清理**：Tree 暫存檔與 cache 目錄刪除改用 `fs.promises.rm`，避免同步 filesystem API 阻塞 Extension Host。

### 文件與測試
- 更新 `README.md`，說明 Output retention、檔案 log 路徑限制，以及兩個 traversal concurrency 設定的負載與回復方式。
- 新增 `docs/watch-ignore-policy-2026-07-03.md`，保留 watcher policy matrix、rename-vs-move 定義與事件範例。
- `docs/REPORT.md` 統一記錄 P0／P1／P2 完成證據、效能量測、殘餘風險與 P1-4／P1-5 後續工作。
- 測試擴充至 65 個案例，涵蓋 queue 終態、retry client、empty deployment、ignore policy、file log、multi-root、watch batching、Tree eviction 與有界 traversal。

### 驗證結果
- `corepack pnpm test`：65 passing。
- `corepack pnpm run typecheck:strict`、`check:i18n`、`lint --quiet`：通過。
- `corepack pnpm run package`：production webpack build 通過。
- `corepack pnpm audit --prod`：0 known vulnerabilities。
- VS Code 1.82.0 與 Stable 1.129.0 Extension Host：exit code 0。
- `ssh-tools-0.6.3.vsix`：使用 VSCE 3.9.2 `--no-dependencies` 建立並檢查實包。

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
- `CHANGELOG.md`：將當時尚未發布的版本草稿合併為 v0.6.1。
- `docs/i18n/CHANGELOG.zh-TW.md`：將當時尚未發布的版本草稿合併為 v0.6.1。
- `docs/i18n/CHANGELOG_DETAIL.zh-TW.md`：將當時尚未發布的版本草稿合併為 v0.6.1 詳細追蹤。
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
