# vscode_sync_tool 程式改進路線圖

> 最後更新：2026-06-22
> 本文件是專案唯一持續更新的改進目標與優先順序總覽。歷史效能分析保留於 [2026-05-25 Complexity Report](archive/complexity-report-2026-05-25.md)。

## 未完成項目核對結果

> 核對日期：2026-06-22。狀態依目前程式碼、測試、設定與 CI 檔案確認。

| 狀態 | 項目 | 核對結果 |
| --- | --- | --- |
| ⬜ | P0-1 任務終態與 cache 清理 | 成功與 skip 會呼叫 `allTaskCompleted()`；retry exhausted／connection error 只停止 queue，`drain` 仍未統一 finalize。 |
| 🟡 | P0-2 上下載 ignore 語意 | 上傳 matcher、negation 與 Windows 路徑已有測試；下載 traversal 尚未在進入子目錄前排除，也沒有 FTP/SFTP 完整矩陣。 |
| ⬜ | P0-3 Multi-root workspace | `getRootPath(file)` 仍固定回傳第一個 workspace folder。 |
| ✅ | P0-4 CI 與發布閘門 | GitHub Actions 已執行安裝、翻譯檢查、測試、strict typecheck、lint、production build、audit 與 VSIX 實包。 |
| ⬜ | P1-1 Client 型別邊界 | `src` 仍約有 67 處 `any`，核心 transfer client 仍以 `any` 傳遞。 |
| ⬜ | P1-2 Git 子程序安全 | 仍使用 `exec()` 與 shell command 字串，並依英文 stdout/stderr 判斷狀態。 |
| 🟡 | P1-3 Queue／事件／設定模型 | `Task.operationType` 已改為必填 union，原始碼中的 JSON stringify/parse clone 已清除；watch operation、事件 payload 與設定模型仍待收斂。 |
| 🟡 | P1-4 i18n/l10n 一致性 | 所有語系 key 已一致並納入 CI；核心流程仍有硬編碼中英文 log。 |
| ⬜ | P2-1 有界並行下載 traversal | FTP/SFTP 資料夾下載仍為序列 depth-first recursion。 |
| ⬜ | P2-2 Tree cache 生命週期 | `children`／`allNodes` 雙重持有與分散 invalidation 仍存在，尚無 10k entry measurement。 |
| ⬜ | P2-3 非阻塞本地 traversal | `getAllFiles()` 仍使用同步 filesystem API。 |
| 🟡 | P2-4 Watch rename 索引 | rename chain 行為已有測試，但 lookup 仍掃描全部 pending entries，尚未建立索引或 benchmark。 |
| 🟡 | P3-1 拖曳上傳／遠端移動確認 | Tree View drag-and-drop 與持久設定 `SyncTools.confirmMoveOrUpload` 已實作；尚無聚焦測試。 |
| 🟡 | P3-2 同步狀態一致收尾 | 已有 `start_sync`／`complete_sync` 事件與 Tree View／Status Bar 更新；錯誤、stop 與 retry exhausted 仍未統一 finalize。 |
| 🟡 | P3-3 SSH 壓縮上傳與自動解壓 | ZIP 建立、壓縮檔上傳與 SSH `unzip` 已實作；仍缺路徑 quoting、安全執行、能力檢查與聚焦測試。 |
| ⬜ | P3-4 SSH 遠端右鍵解壓縮 | commands、Tree View context menu 與 command handler 均未提供遠端解壓縮操作。 |
| 🟡 | P3-5 單檔差異檢視 UI | Tree View 與 Explorer 已提供 compare command，並透過 `vscode.diff` 比較本地與遠端檔案；尚無聚焦測試。 |
| ⬜ | P3-6 雙向同步 | 尚未建立雙向同步流程、衝突策略與批次差異檢視。 |

狀態圖示：⬜ 未完成；🟡 部分完成；✅ 已完成。

## 目前基線

- 技術：TypeScript、VS Code Extension API、Webpack；build／CI 使用 Node 22 與 pnpm 10，擴充套件執行期最低為 VS Code 1.82／Node 18。
- 測試：Mocha，現有 20 個聚焦測試。
- 發布入口：`dist/extension.js`，VSIX 使用 `--no-dependencies` 打包。
- 正式依賴安全稽核：0 vulnerabilities。
- 目前驗證指令：
  - `npm test`
  - `npm run typecheck:strict`
  - `npm run check:i18n`
  - `npm run lint -- --quiet`
  - `npm run package`
  - `pnpm audit --prod`

## 已完成的基礎改進

- [x] 修正 Windows 遠端路徑與資料夾 rename 行為。
- [x] 修正 FTP 空檔案上傳修改本地檔案的副作用。
- [x] 強化 FTP/SFTP 連線池清理與上限控制。
- [x] 快取已確認的遠端資料夾，並合併相同資料夾的進行中檢查。
- [x] 序列化 watcher cache 的讀取、合併與寫入。
- [x] 預編譯 ignore matcher，支援安全的反向規則與精確檔案還原。
- [x] 限制動態並行探測頻率，避免重複建立測試連線。
- [x] 快取 FTP 檔案時間同步策略。
- [x] 建立測試 harness、VS Code mock、嚴格型別檢查與 VSIX 實包驗證。
- [x] 修正 VSIX 遺漏 Log language configuration／grammar。
- [x] 更新正式依賴並清除 production audit 警報。
- [x] 建立 GitHub Actions CI、固定 pnpm 版本並產生可驗證的 VSIX artifact。
- [x] 自動檢查 package/runtime 翻譯 key，並移除過時的重複 key。

## 環境版本與升級上限

> 核對日期：2026-06-22。此處記錄的是專案建置與執行環境，不以開發者本機已安裝版本作為升級依據。本機只需符合專案指定的 build baseline。
>
> 「直升上限」表示不修改或只做極小修正時可採用的版本；「最高版本」表示上游目前最新版，可能需要設定、模組格式或最低 VS Code 版本遷移。

### 版本總覽

| 項目 | 現在 | 建議 | 最高 |
| --- | --- | --- | --- |
| Node.js（build／CI） | `22.x` | `22.x` | `26.3.1` Current |
| pnpm | `10.34.4` | `10.34.4` | `11.8.0` |
| `engines.vscode` | `^1.82.0` | `^1.82.0` | `^1.125.0` |
| `@types/vscode` | `1.82.0` | `1.82.0` | `1.125.0` |
| `@types/node` | `18.19.130` | `18.19.130` | `26.0.0` |
| TypeScript | `5.9.3` | `5.9.3` | `6.0.3` |
| ESLint | `9.39.4` | `9.39.4` | `10.5.0` |
| typescript-eslint | `8.61.1` | `8.61.1` | `8.61.1` |
| Webpack | `5.107.2` | `5.107.2` | `5.107.2` |
| webpack-cli | `7.0.3` | `7.0.3` | `7.0.3` |
| ts-loader | `9.6.1` | `9.6.1` | `9.6.1` |
| Mocha | `11.7.6` | `11.7.6` | `11.7.6` |
| VSCE | `3.9.2` | `3.9.2` | `3.9.2` |
| javascript-obfuscator | `5.4.3` | `5.4.3` | `5.4.3` |
| `@types/archiver` | `5.3.4` | `7.0.0` | `8.0.0` |
| archiver | `7.0.1` | `7.0.1` | `8.0.0` |
| minimatch | `9.0.9` | `9.0.9` | `10.2.5` |
| chalk | `4.1.2` | `4.1.2` | `5.6.2` |
| uuid | `11.1.1` | `11.1.1` | `14.0.1` |

### 判定摘要

- Build／CI 固定使用 Node 22 與 pnpm 10.34.4；本機能正常建置時不需為此升級。
- 最低 VS Code 維持 `^1.82.0`，並以 `@types/vscode 1.82.0`、Node 18 型別及 Extension Host 測試守住相容性。
- TypeScript 5.9、ESLint 9、typescript-eslint 8、Mocha 11、webpack-cli 7 與 javascript-obfuscator 5 已完成升級。
- TypeScript 6、ESLint 10、pnpm 11 與 ESM-only major 套件需另案遷移，不直接追最新版。
- 下一個低風險項目是將 `@types/archiver` 對齊 archiver 7；只有出現新 API 或 runtime 需求時才提高最低 VS Code。

### 驗證狀態

`npm test`、strict typecheck、lint、i18n、production build、production audit、VS Code 1.82／Stable Extension Host 測試及 `0.6.2` VSIX 打包均已通過。

## 優先級定義

| 優先級 | 定義 |
| --- | --- |
| P0 | 可能造成資料遺失、狀態錯亂、錯誤上傳或發布失敗；應優先處理。 |
| P1 | 顯著降低維護成本、安全風險與後續功能開發難度。 |
| P2 | 大型專案、遠端高延遲或大量檔案時的效能與記憶體改善。 |
| P3 | 產品體驗與新功能；應建立在 P0/P1 穩定基礎上。 |

## P0：正確性與可靠性

### P0-1 統一任務終態與 watch cache 清理

狀態：⬜ 確認未完成。

現況：

- `allTaskCompleted()` 主要在成功或 skip 路徑觸發。
- queue 的 `drain` callback 尚未統一執行清理。
- retry 用盡、停止或連線錯誤時，watch cache 與 UI 狀態可能未完整收尾。

改進：

- 建立 config-scoped 任務終態處理：`completed`、`failed`、`cancelled`、`stopped`。
- 將 cache 清理、Status Bar、Tree View refresh 與連線回收集中到單一 finalize 流程。
- 保證每個 task 只 finalize 一次，且 queue 完成時一定進行 config-level cleanup。

完成條件：

- success、skip、retry exhausted、connection error、stop 五種路徑都有測試。
- queue 清空後不殘留 watch cache、pending promise 或工作中 UI 狀態。
- 失敗任務仍保留可診斷錯誤資訊，不因清理被覆蓋。

風險：高。

### P0-2 統一上傳與下載的 ignore 語意

狀態：🟡 部分完成。

現況：

- 上傳 ignore 已有較完整測試，下載主要依賴 `downloadExcludePath`。
- 上傳已支援 compiled matcher、negation、精確檔案還原與 workspace escape rejection。
- `.gitignore` 更新、資料夾規則、反向規則與下載 traversal 尚未有完整矩陣測試。

改進：

- 上傳與下載共用編譯後的規則表示與路徑正規化。
- 在進入遠端子資料夾前套用下載排除規則，避免無效 list 與 task 建立。
- 明確定義 `.gitignore`、全域 `excludePath`、config `excludePath`、`downloadExcludePath` 的優先順序。
- `.gitignore` 或設定變更時明確失效 matcher/cache。

完成條件：

- 覆蓋 Windows/POSIX separator、資料夾、精確檔案、glob、negation 與 cache invalidation。
- FTP 與 SFTP 下載結果一致。
- 不允許規則解析至 workspace 或 remote root 之外。

風險：高。

### P0-3 正確支援 multi-root workspace

狀態：⬜ 確認未完成。

現況：

- `getRootPath(file)` 目前固定回傳第一個 workspace folder。
- 多根工作區可能使用錯誤的 ignore、sync config、remote path 或 cache key。
- 此項不能只修改 `getRootPath(file)`：watcher、Tree Provider、Deploy 與 FileTransfer 目前都會在建立時綁定單一 root，需一起改為 workspace-scoped 實例或明確傳遞 root。

改進：

- 使用 `vscode.workspace.getWorkspaceFolder(uri)` 找出檔案所屬根目錄。
- 無法歸屬 workspace 時明確回退或拒絕執行，不以字串 `indexOf` 判斷子路徑。
- workspace root 納入 config cache、watch cache 與 upload debounce key。

完成條件：

- 兩個 workspace folder 使用不同 config／ignore 時互不污染。
- 相似前綴路徑（例如 `app` 與 `app-old`）不會誤判。

風險：高。

### P0-4 建立持續整合與發布閘門

狀態：✅ 已完成。

已完成：

- `.github/workflows/ci.yml` 使用 Node 22 與固定 pnpm 版本進行 frozen lockfile 安裝。
- CI 固定執行翻譯檢查、測試、strict typecheck、lint error gate、production build 與 production audit。
- CI 額外產生並上傳 VSIX artifact，驗證 manifest 引用檔案及必要靜態資源。
- `pretest` 使用有限次 typecheck，未呼叫 `compile` watch script。

完成條件：

- Pull request 能自動攔截測試、型別、打包或資源遺漏。
- 發布流程不依賴本機既有 `node_modules` 狀態。

風險：低。

## P1：型別、安全與可維護性

### P1-1 建立 FTP/SFTP client 型別邊界

狀態：⬜ 確認未完成。

現況：`src` 約有 67 處 `any`，主要集中於 `FileTransfer.ts` 的 client、連線池與遠端檔案資料。

改進順序：

1. 定義 `FtpTransferClient`、`SftpTransferClient` 與最小共用介面。
2. 為遠端 list item、progress callback、connection pool 建立具體型別。
3. 將 config parsing 與 caught error 改為 `unknown` 後縮窄。
4. 保留 `oConsole(...message: any[])` 等合理的邊界型 `any`。

完成條件：

- `FileTransfer.ts`、`treeProvider.ts` 與 `deploy.ts` 不再以 `client: any` 傳遞核心操作。
- FTP-only／SFTP-only API 能由 TypeScript 判斷，減少 runtime capability check。

風險：中。

### P1-2 強化 Git 子程序執行

狀態：⬜ 確認未完成。

現況：

- 使用 shell command 字串執行 `git add/commit/push`。
- workspace path 與 commit message 拼接進命令，存在 quoting、注入、timeout 與取消問題。

改進：

- 改用 `spawn`／`execFile` 與參數陣列，分步執行 Git。
- 加入 timeout、取消、exit code 與 stdout/stderr 結構化處理。
- 不再依賴英文輸出字串判斷 Git 狀態。

完成條件：

- 路徑含空格、引號與非 ASCII 字元可正常執行。
- commit message 不可能改變命令結構。
- 可區分 no changes、push failure、authentication failure 與 cancellation。

風險：中。

### P1-3 收斂 queue、事件與設定模型

狀態：🟡 部分完成。

已完成：

- `Task.operationType` 已由 optional `string` 改為必填的 `upload | download | delete | rename` union。
- 新增明確的 task clone helper；保留共用 config 參照，並複製可變的 `fileChunks`。
- 原始碼中的 `JSON.parse(JSON.stringify(...))` clone 已全部移除。
- watch cache 寫入改存放 operation 副本，避免呼叫端後續修改污染 cache。

尚待處理：

- 將 watch operation 與事件 payload 改為 discriminated union。
- 將 config default/migration 與 runtime config 分離。
- 清理 `map()` 僅用於副作用、鬆散相等與過時註解。

完成條件：

- 未知 operation type 在編譯期可被發現。
- rename、delete、upload、download 的必填欄位由型別保證。

風險：中。

### P1-4 完成 i18n/l10n 一致性

狀態：🟡 部分完成。

現況：

- `package.nls.*.json` 與基準檔案 key 一致。
- 所有 runtime l10n 語系與基準 key 一致，過時的額外 key 已移除。
- `scripts/check-i18n.mjs` 會檢查語系集合、缺少 key 與額外 key，並已納入 CI。
- 核心流程仍有硬編碼中文與英文 log。

改進：

- 移除核心流程中的硬編碼中文／英文 log 與錯誤訊息。
- 文件、設定範本與 runtime 文案使用一致名稱。

完成條件：

- CI 能偵測缺少或多餘 translation key。
- 13 個支援語系不缺 package 與 runtime 必要字串。

風險：低。

## P2：效能與擴展性

### P2-1 遠端資料夾下載改為有界並行 traversal

狀態：⬜ 確認未完成。

現況：FTP/SFTP 資料夾下載採序列 depth-first list，延遲約隨資料夾數線性累積。

改進：

- 將 traversal 與檔案下載 task 建立分離。
- 使用保守且可設定的 list concurrency。
- FTP 不在同一 client 上同時執行多個 command；必要時使用獨立 client。
- 加入取消、permission denied 與 partial failure 行為。

完成條件：

- 與現行 traversal 產生相同檔案集合及穩定順序。
- 使用模擬高延遲 server 的 benchmark 比較前後時間與連線數。

複雜度：總工作量仍為 `O(D + F)`，但 wall-clock latency 可接近 `O(D / L + F)`。

風險：中高。

### P2-2 Tree Provider cache 生命週期與大型目錄

狀態：⬜ 確認未完成。

現況：

- 展開目錄後同時由 `children` 與 `allNodes` 持有節點。
- refresh、rename、delete、disconnect 的 subtree invalidation 分散。
- 單一超大型目錄會完整配置、排序並保留全部節點。

改進：

- 將 `allNodes` 改為 `Map`，建立統一 subtree eviction helper。
- refresh／delete／rename／disconnect 共用 cache invalidation。
- 先量測節點數與記憶體；達到實際門檻後再評估 paging 或顯示上限。
- 將副作用 `map()` 改為 `for...of`，避免無用陣列配置。

完成條件：

- 重複 connect/disconnect、refresh、rename 後節點數能回到預期範圍。
- 10k entry 模擬目錄具備時間與記憶體基線。

複雜度：排序維持 `O(R log R)`；目標是降低 retained memory 與重複配置。

風險：中。

### P2-3 本地檔案 traversal 避免阻塞 Extension Host

狀態：⬜ 確認未完成。

現況：`getAllFiles()` 使用同步 filesystem API 遞迴掃描。

改進：

- 改用 `fs.promises` 與 bounded concurrency。
- 保留 ignore directory pruning 與輸出順序。
- 大量檔案時支援 progress、取消或分批 enqueue。

完成條件：

- 以 1k、10k、50k 檔案 fixture 建立時間與 event-loop delay benchmark。
- 結果集合與現行版本一致。

風險：中。

### P2-4 Watch rename lookup 建立索引

狀態：🟡 部分完成；行為測試已存在，索引與 measurement 未完成。

現況：rename/delete chain 可能掃描全部 pending watch entry，單次為 `O(W)`。

改進：

- 維護 `newname -> original key` 索引，rename chain lookup 降為近似 `O(1)`。
- 與 workspaceState 持久資料保持一致，清理時同步移除。

完成條件：

- 連續 rename、rename 後 delete、edit 後 rename、add 後 rename 行為維持一致。
- 大量 pending entry benchmark 顯示 lookup 不再隨 `W` 線性成長。

風險：中。

## P3：產品體驗與新功能

建議順序：

1. 完成同步任務錯誤／停止路徑的 Tree View／Status Bar 一致收尾（與 P0-1 同步）。
2. SSH 壓縮、解壓縮的安全執行、錯誤處理與測試完善。
3. SSH 遠端右鍵解壓縮。
4. 雙向同步與批次差異檢視 UI。

已具備基本實作：

- 拖曳本地檔案上傳與遠端節點移動都具備確認流程，並由 `SyncTools.confirmMoveOrUpload` 控制。
- Tree View 與 Explorer 已提供單檔差異檢視，透過 `vscode.diff` 比較本地與遠端檔案。
- 上述兩項尚缺聚焦測試，因此核對狀態維持部分完成。

尚未完成的 P3 功能在開始前應先定義：

- 使用者流程與取消行為。
- FTP、SFTP、SSH 能力差異。
- 衝突處理與資料覆蓋確認。
- 大量檔案時的 progress 與錯誤彙總。

## 建議執行里程碑

| 里程碑 | 內容 | 預期結果 |
| --- | --- | --- |
| M1：可靠性 | P0-1、P0-2、P0-3、P0-4 | 任務終態、ignore、multi-root 與發布流程可預期。 |
| M2：核心重構 | P1-1、P1-2、P1-3 | 降低 `any`、shell 與 queue 模型風險。 |
| M3：擴展性 | P2-1、P2-2、P2-3、P2-4 | 大型工作區與高延遲 server 的效能可量測、可改善。 |
| M4：產品功能 | P1-4、P3 | 在穩定核心上補齊翻譯與使用者體驗。 |

## 暫不處理

- 不直接修改 vendored `src/lib/ssh2-sftp-client`，除非決定正式維護 fork。
- 不為消除全部 lint warning 進行全專案格式化；應配合實際修改逐步收斂。
- 未建立 benchmark 前，不先導入 Tree View paging 或複雜 cache framework。
- 不在任務終態與衝突策略穩定前開始雙向同步 UI。

## 每項改進的完成標準

- 行為有聚焦測試，涵蓋正常、空值、重複、錯誤、取消與平台路徑差異。
- `npm test` 通過。
- `npm run typecheck:strict` 通過。
- `npm run lint -- --quiet` 通過。
- `npm run package` 通過。
- 正式依賴變更後 `pnpm audit --prod` 無高風險問題。
- 發布相關變更需實際建立 VSIX 並檢查內容。
- 效能改進需附前後 measurement；只有理論複雜度說明不足以宣告完成。
