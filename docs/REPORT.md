# vscode_sync_tool 程式改進路線圖

> 最後更新：2026-08-30
> 本文件是專案唯一持續更新的改進目標與優先順序總覽。歷史效能分析保留於 [2026-05-25 Complexity Report](archive/complexity-report-2026-05-25.md)。

## 文件重點

- P0 正確性項目已收斂：任務終態、ignore 語意、multi-root scope 與發布閘門都有聚焦測試或 CI gate 保護。
- 2026-07-03 新增 watcher ignore policy gate，補齊 rename/move 進出 ignored path 的同步語意。
- 2026-07-10 完成 P2 前審查；修正 Tree refresh await、retry client 重複歸還、空部署未 finalize、CI lint 參數與 Stop Sync 標題，完整閘門已通過。
- 2026-07-13 修正成功收尾後 Output 記錄短暫出現即消失；記錄改為只由明確命令或數量上限清除，並新增可選的工作區相對檔案 log。
- 2026-07-17 完成 P2 效能改善：watch cache 索引與批次持久化、可回復序列行為的遠端有界 traversal、Tree subtree eviction／批次 refresh，以及非阻塞本機 traversal。
- 2026-07-17 完成 v0.6.3 發行核對：版本紀錄已統一，65 tests、完整 CI 同級閘門、VS Code 1.82／Stable 1.129 Extension Host 與 VSIX 實包均通過。
- 2026-07-31 依實機測試修正 `tools/**` 目錄根漏接與資料夾新增後立即改名的 stale upload；失效任務不再重試或先建立舊遠端目錄，並完成新公告依賴漏洞修補與完整閘門。
- 2026-08-30 修正 watch 資料夾待辦展開後重用父目錄遠端路徑的問題；每個子檔現在都保留完整 workspace-relative suffix。
- 2026-08-30 完成 P1-4／P1-5：核心訊息與 Build 術語已統一，untrusted workspace 不會執行 `config.build`，async Promise executor 已移除並補齊聚焦測試。
- 2026-08-30 完成 upstream `390af0d` 選擇性整合：移除到期閘門，並以 multi-root、安全搬移、失敗回復與 cache reload 重新實作外部配置儲存；未帶入 agent rule、生成檔與 vendored SFTP 改寫。
- 2026-08-30 完成 P3-1～P3-5：拖曳／遠端移動安全邊界、同步終態顯示、SSH ZIP 安全解壓縮與右鍵命令，以及 fresh remote 單檔差異檢視均已補齊測試。
- `upstream-main` 已精確指向 upstream `390af0d` 並推送至 `origin/upstream-main`；經審查的整合則由 `main` 保存，不直接修改純 upstream 鏡像。
- 下一步為 P3-6 雙向同步；開始前需先定義衝突策略、覆寫確認與批次結果 UI。
- 目前不追最新版工具鏈；build baseline 維持 Node 22、pnpm 10、VS Code `^1.82.0`。

## 開發項目核對表

> 核對日期：2026-08-30。狀態依目前程式碼、測試、設定與 CI 檔案確認。

| 狀態 | 項目 | 核對結果 |
| --- | --- | --- |
| ✅ | P0-1 任務終態、cache 與診斷記錄 | queue `drain`、失敗、取消、停止、skip 與空部署已統一進入 config-scoped finalize；stale upload 在遠端 mutation 前結束；watch 資料夾展開保留子檔遠端路徑；成功 finalize 不再清除 Output，檔案 log 具 workspace scope 與路徑邊界。 |
| ✅ | P0-2 上下載與 watcher ignore 語意 | 上下載共用 compiled matcher；`tools/**` 同時涵蓋目錄根與 descendants；FTP/SFTP 在 list 子目錄前 pruning；watcher rename/move 會同時檢查 old/new path。 |
| ✅ | P0-3 Multi-root workspace | workspace root 已納入 config、queue、connection pool、watch cache、debounce、Tree node 與暫存檔 scope。 |
| ✅ | P0-4 CI 與發布閘門 | GitHub Actions 已執行安裝、翻譯檢查、測試、strict typecheck、lint、production build、audit 與 VSIX 實包；pnpm lint 參數已修正為有效 gate。 |
| ✅ | P1-1 Queue／事件／設定模型 | `Task.operationType`、watch `opType` 與 `myEvent` payload 已收斂為 discriminated union；config raw/default normalization 與 runtime `workspaceRoot` 注入已分離。 |
| ✅ | P1-2 Client 型別邊界 | `FileTransfer.ts`、`treeProvider.ts` 與 `deploy.ts` 已不再以 `client: any` 傳遞核心操作；FTP/SFTP client、connection pool、遠端 list item 與 progress callback 已具體型別化。 |
| ✅ | P1-3 Git 子程序安全 | Git submit 已改用 `execFile("git", args)` 與固定步驟 `add`／`diff --cached --quiet`／`commit`／`push`；commit message 不再進入 shell 字串，no changes 與 push/auth failure 有聚焦測試。 |
| ✅ | P1-4 i18n/l10n 一致性 | package/runtime 語系 key 與原始碼引用均納入 CI；核心訊息已改用 l10n，Build 術語一致，高頻重複 debug log 已移除。 |
| ✅ | P1-5 Workspace Trust／非同步邊界 | untrusted workspace 不會執行 `config.build`；`Deploy.start()` 與 `getIgnoreConfig()` 已改為直接 async function，並覆蓋 build、提示取消、Deploy 取消與 cache 錯誤測試。 |
| ✅ | P2-1 Watch rename 索引 | 以 `newname -> source keys` 索引處理 rename chain，50 ms burst 內只讀寫一次 workspaceState；清除、部署與停用前都有 flush barrier。 |
| ✅ | P2-2 有界並行下載 traversal | 每份 `sync_config.jsonc` 可設定 `downloadTraversalConcurrency`；預設 2，設為 1 可恢復舊版序列 traversal，並與 transfer 共用全域連線額度。 |
| ✅ | P2-3 Tree cache 生命週期 | `allNodes` 已改為 `Map` 與統一 subtree eviction；refresh／delete／rename／disconnect 不再留下失效索引，完成事件以 50 ms 批次更新。 |
| ✅ | P2-4 非阻塞本地 traversal | `getAllFiles()` 已改用 `fs.promises`／`Dirent` 與有界非同步 I/O；`localTraversalConcurrency` 預設 4，設為 1 可降低磁碟瞬時負載。 |
| ✅ | P3-1 拖曳上傳／遠端移動確認 | 本機 URI 拖曳支援取消與 POSIX 路徑；遠端移動限制同一 config/workspace scope、禁止移入自身、不覆寫既有目的地，且 client 僅釋放一次。 |
| ✅ | P3-2 同步狀態一致收尾 | `completed`、`failed`、`cancelled`、`stopped` 已統一更新 Tree View／Status Bar／UI event，使用者可見終態已本地化，並由 finalize 保證只收尾一次。 |
| ✅ | P3-3 SSH 壓縮上傳與自動解壓 | 遠端 `unzip` 具能力檢查、POSIX shell 參數 quoting、ZIP 項目 path traversal 預檢、精確 exit code 與錯誤內容處理，並有聚焦測試。 |
| ✅ | P3-4 SSH 遠端右鍵解壓縮 | SSH `.zip` 節點提供本地化右鍵命令；確認覆寫風險後解壓至父目錄，成功刷新 Tree、失敗保留結構化 log，client 一律釋放。 |
| ✅ | P3-5 單檔差異檢視 UI | Tree View 與 Explorer 均拒絕資料夾、每次重新下載遠端副本、await `vscode.diff`，並統一本機在左、遠端在右。 |
| ⬜ | P3-6 雙向同步 | 尚未建立雙向同步流程、衝突策略與批次差異檢視。 |

狀態圖示：⬜ 未完成；🟡 部分完成；✅ 已完成。

## P2 前審查結果（2026-07-10）

結論：審查發現的 5 個封裝前錯誤均已修正，未留下 release blocker；production build、正式依賴 audit、VS Code 1.82、Stable 1.128.0 Extension Host 與 VSIX 實包均通過。

已修正：

| 位置 | 問題 | 修正與驗證 |
| --- | --- | --- |
| `src/extension.ts` event listener | `uploadComplete()` 未 await，mutex 會在 Tree node 更新完成前釋放。 | 恢復 await，並等待同步狀態更新。 |
| `src/FileTransfer.ts` retry path | retry 重新連線失敗時可能再次釋放上一輪已歸還的 client。 | release 後立即清除參照；新增聚焦回歸測試。 |
| `src/deploy.ts` empty deployment | 沒有 enqueue transfer task 時不會觸發 queue drain，UI 可能停在 busy。 | idle／empty queue 直接進入 completed finalize；新增聚焦測試。 |
| `.github/workflows/ci.yml` | `pnpm run lint -- --quiet` 會把 `--quiet` 當成檔案 pattern。 | 改為 `pnpm run lint --quiet`，本機同命令已通過。 |
| `package.json` | Stop Sync command 誤用 Pause Sync 的 l10n title。 | 改用既有 `%SyncTools.stopSync%` key；i18n key gate 通過。 |

P2 處理結果（原審查項目）：

| 優先 | 位置／現況 | 目前複雜度或風險 | 建議與完成證據 |
| --- | --- | --- | --- |
| 1 | `src/watchCache.ts` rename chain 以 `Object.entries()` 掃描 pending entries。 | 每次 lookup `O(W)`；大量 watcher 事件累積時為主要熱點。 | ✅ 已以索引與 50 ms 批次持久化完成；50k entries／1k operations 合成量測為 37.7 ms。 |
| 2 | `src/utils.ts` `getAllFiles()` 使用同步 `readdirSync`／`lstatSync`，且同一 entry 可能重複 stat。 | 總工作量 `O(F)`，但會阻塞 Extension Host。 | ✅ 已改為 `fs.promises`／`Dirent` 與有界 I/O；1k／10k／50k fixture 均驗證集合與 event-loop delay。 |
| 3 | `src/treeProvider.ts` 同時由 `children` 與 `allNodes` 持有節點，subtree invalidation 分散。 | lookup 近似 `O(1)`，但 subtree 清理為 `O(N)` 且 retained memory 隨展開節點增加。 | ✅ 已改為 `Map` 與統一 eviction；10k fixture 淘汰後索引由 10,001 回到 1。 |
| 4 | `src/FileTransfer.ts` FTP/SFTP 下載 traversal 採序列 DFS。 | 工作量 `O(D + F)`；wall-clock 受每層遠端 list latency 線性累積。 | ✅ 已加入 per-config 有界 traversal、共享連線額度與整批失敗語意；設定 1 可完整返回舊序列路徑。 |
| 5 | `src/deploy.ts`／`src/utils.ts` 非同步 executor 與 workspace command 邊界。 | 不是演算法瓶頸，但錯誤傳遞與不受信任 workspace 的 command 執行風險較難審計。 | ✅ 已改為直接 async function；untrusted workspace 禁止 build，並覆蓋取消、throw、cache 錯誤與 build 測試。 |

掃描說明：complexity scanner 僅作候選清單；`.vscode-test`、`src/lib` 與生成物已排除，最終排序依實際 hot path、目前測試與人工 diff 審查判定。

## 已完成的基礎改進

| 類別 | 已完成內容 |
| --- | --- |
| ✅ 同步正確性 | 修正 Windows 遠端路徑、資料夾 rename、FTP 空檔案上傳副作用、queue 任務終態與 watch cache／UI finalize。 |
| ✅ ignore 與 watcher policy | 統一上下載 ignore matcher；下載 traversal 可在 list 前排除子樹；watcher rename/move 會同時檢查 old/new path，並以 `pathChangeType` 區分 `[rename]`／`[move]`。 |
| ✅ cache 與連線 | 強化 FTP/SFTP 連線池清理與上限控制；快取已確認遠端資料夾與 FTP 檔案時間同步策略；合併相同資料夾的進行中檢查；限制動態並行探測頻率。 |
| ✅ multi-root scope | config、watcher、Tree、queue、connection pool、暫存檔與 cache key 已納入 workspace scope。 |
| ✅ 診斷記錄 | Output 保留最新 `SyncTools.logNumberLimit` 筆記錄並支援手動清除；可選檔案 log 預設寫入 `<workspace>/sync_logs/sync-tools.log`，自訂目錄不得離開工作區。 |
| ✅ 測試與發布 | 建立 Mocha harness、VS Code mock、strict typecheck、VSIX 實包驗證、GitHub Actions CI、translation key 檢查與 production audit gate。 |
| ✅ 包裝完整性 | 修正 VSIX 遺漏 Log language configuration／grammar，並以 `.vscodeignore` 排除開發／中間產物。 |

## 目前基線與驗證

- 技術：TypeScript、VS Code Extension API、Webpack；build／CI 使用 Node 22 與 pnpm 10，擴充套件執行期最低為 VS Code 1.82／Node 18。
- 正式版本：`0.6.3`；後續 VSIX 重建應產生 `ssh-tools-0.6.3.vsix`，不得再以 `0.6.2` 覆蓋新改動。
- 測試：Mocha，現有 80 個聚焦測試。
- 發布入口：`dist/extension.js`，VSIX 使用 `--no-dependencies` 打包。
- 正式依賴安全稽核：0 vulnerabilities。
- 最近驗證：
  - 2026-08-30 P3-1～P3-5 完成：102 passing、strict typecheck、source-aware i18n、lint error gate、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.135.0 Extension Host 與暫存 VSIX（58 files、2.33 MiB；bundle 6.84 MiB）均通過；SHA-256 `0C8B6228AA917E45433F645F3DCDF1F0A291D43C9D60A54805294F78AF70C3DD`。
  - 2026-08-30 upstream 選擇性整合：80 passing、strict typecheck、source-aware i18n、lint error gate、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.135.0 Extension Host 與暫存 VSIX（58 files、2.35 MiB；bundle 6.93 MiB）均通過；SHA-256 `C5018C8DEA29ADDAF16D4CFD69E1903F8E6FB5F480C89CFD38F2806026D44AF3`。
  - 2026-08-30 P1 完成與 v0.6.3 重建：75 passing、strict typecheck、source-aware i18n、lint error gate、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.135.0 Extension Host 與 VSIX 實包（58 files、2.37 MiB）均通過；SHA-256 `F3F6438100AD1DF9A5B610171F9089567DF43B6BC450F476C729CE54EBED3DB9`。
  - 2026-08-30 watch 資料夾上傳路徑修正：69 passing、strict typecheck、i18n、lint error gate、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.135.0 Extension Host 與 VSIX 實包（58 files、2.34 MiB）均通過。
  - 2026-07-31 v0.6.3 實測回歸修正：68 passing、strict typecheck、i18n、lint error gate、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.131.0 Extension Host 與 VSIX 實包（58 files、2.32 MiB）均通過。
  - 2026-07-17 v0.6.3 正式發行閘門：65 passing、strict typecheck、i18n、lint、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.129.0 Extension Host 與 `ssh-tools-0.6.3.vsix` 實包均通過。
  - 2026-07-13 Output retention／file log：51 passing、strict typecheck、i18n、lint、production build 與 package JSON 檢查均通過。
  - 2026-07-10 P2 前完整閘門：45 passing、strict typecheck、i18n、lint、production build、production audit（0 vulnerabilities）、VS Code 1.82／Stable 1.128.0 Extension Host 與 VSIX 實包均通過。
  - 2026-07-03 P1-3 Git submit safety 後：`npm test`（43 passing）。
  - 2026-07-03 watcher ignore policy gate 後：`npm test`（39 passing）。
  - 2026-06-29 full gate：strict typecheck、lint、i18n、production build、production audit、VS Code 1.82／Stable 1.126.0 Extension Host 測試及 VSIX 實包均已通過。
- 目前驗證指令：
  - `npm test`
  - `npm run typecheck:strict`
  - `npm run check:i18n`
  - `corepack pnpm run lint --quiet`
  - `npm run package`
  - `pnpm audit --prod`
  - `npm run test:vscode:min`
  - `npm run test:vscode:stable`
  - `npx --yes @vscode/vsce@3.9.2 package --no-dependencies`

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

## 優先級定義

| 優先級 | 定義 |
| --- | --- |
| P0 | 可能造成資料遺失、狀態錯亂、錯誤上傳或發布失敗；應優先處理。 |
| P1 | 顯著降低維護成本、安全風險與後續功能開發難度。 |
| P2 | 大型專案、遠端高延遲或大量檔案時的效能與記憶體改善。 |
| P3 | 產品體驗與新功能；應建立在 P0/P1 穩定基礎上。 |

## P0：正確性與可靠性

### P0-1 統一任務終態、watch cache 與診斷記錄

狀態：✅ 已完成。

已完成：

- queue 以 workspace root＋config name 為 scope，`drain` 會使用最新 scoped config 統一呼叫 config-level finalize。
- 任務終態收斂為 `completed`、`failed`、`cancelled`、`stopped`，retry exhausted 與 connection error 會明確標記為 failed。
- finalize 集中清除 watch cache、已確認／進行中的遠端資料夾檢查，並更新 Status Bar 與 Tree View。
- watch cache cleanup 失敗時仍會送出終態 UI／event，避免卡在 working 狀態。
- 成功 finalize 不再自動清除 Output；僅明確的 Clear All Log 命令會清空面板，超過 `SyncTools.logNumberLimit` 時只移除最舊記錄。
- queue stop 後會重建乾淨 queue；finalize 具 idempotent guard，不會重複收尾。
- successful／failed task 的輸出記錄都會保留；啟用 `SyncTools.logToFile` 後會依 workspace append 到 `sync-tools.log`。
- `SyncTools.logDirectory` 僅接受工作區內相對目錄；絕對路徑、`..` 越界與 workspace root 會被拒絕，啟用的 log 目錄也會加入同步 ignore 規則。
- client 歸還連線池後立即清除 worker 參照；retry 若在重新連線階段失敗，不會再次歸還上一輪 client。
- 非 watch 部署即使沒有 enqueue 任何 transfer task，也會以 idle queue 路徑完成 finalize，不會讓 Tree View 停在 busy。

驗證：

- success、skip、retry exhausted、connection error、retry reconnect failure、empty deployment、stop、cancel 路徑均有聚焦測試。
- cleanup failure、drain latest config、Output retention 與手動清除均有加固測試。
- 測試確認 watch cache 清空、終態正確、錯誤資訊保留、重複 finalize 不改寫首次結果，並覆蓋預設／自訂 log 目錄、並行 append 順序、路徑越界拒絕與同步 ignore。

風險：已收斂。

### P0-2 統一上傳、下載與 watcher ignore 語意

狀態：✅ 已完成。

已完成：

- 上傳與下載共用 compiled path matcher、路徑正規化、negation 與 root boundary 檢查。
- 規則採後項覆蓋前項；上傳合併順序為全域 `excludePath`、config `excludePath`、`.gitignore`，下載使用 config `downloadExcludePath`。
- FTP 與 SFTP traversal 在進入遠端子資料夾前執行 `shouldTraverse()`，被排除且沒有可還原 negation 的子樹不會呼叫 list 或建立 task。
- `.gitignore` cache 以 workspace＋config 為 scope，檔案變更時只失效對應 cache；設定內容變更會產生新的 matcher cache key。
- `../`、磁碟機絕對路徑與 remote/workspace root 外候選路徑不會被規則帶出 scope。
- watcher path change 會在 upload-on-save 排程與 watch cache 寫入前進入 `resolveWatchChangeForIgnore()` policy gate，同時檢查 `oldPath` 與 `newPath`。
- same-folder path change 會標記為 `pathChangeType: "rename"`，cross-folder path change 會標記為 `pathChangeType: "move"`；傳輸層仍使用 `operationType: "rename"`。

watcher ignore policy：

| Old path | New path | 同步動作 |
| --- | --- | --- |
| allowed | allowed | rename |
| allowed | ignored | delete old remote path |
| ignored | allowed | add new path |
| ignored | ignored | skip |

驗證：

- 覆蓋 Windows／POSIX separator、資料夾、精確檔案、glob、negation、規則合併順序及 workspace escape rejection。
- FTP／SFTP 矩陣確認相同排除結果，且排除子樹不會發生遠端 list。
- 覆蓋移入 ignored path、移出 ignored path、ignored-to-ignored skip 與 rename-vs-move 分類。
- `docs/watch-ignore-policy-2026-07-03.md` 記錄 policy matrix、分類規則、影響檔案與 `npm test` 39 passing。

風險：已收斂。

### P0-3 正確支援 multi-root workspace

狀態：✅ 已完成。

已完成：

- `getRootPath(file)` 使用 `vscode.workspace.getWorkspaceFolder(uri)` 精確取得所屬 workspace；多根工作區未提供檔案時不猜測第一個 root。
- Explorer command、save／create／delete／rename watcher、upload-on-save、Deploy、FileTransfer 與 Tree Provider 均明確傳遞 `workspaceRoot`。
- config cache、`.gitignore` cache、watch cache、upload debounce、queue、connection pool、Tree node 與遠端暫存檔 key 均納入 workspace scope。
- Tree View 會彙整所有 workspace folder 的 config；同名 config 以 workspace scope 隔離，並在多根模式顯示 workspace 名稱。
- 無法歸屬 workspace 的本地路徑會拒絕執行，不再使用字串 `indexOf` 判斷子路徑。

驗證：

- `app`／`app-old` 相似前綴路徑可正確歸屬。
- 兩個 workspace 使用同名 config 時，config cache、queue 與 connection pool 互不污染。

風險：已收斂。

### P0-4 建立持續整合與發布閘門

狀態：✅ 已完成。

已完成：

- `.github/workflows/ci.yml` 使用 Node 22 與固定 pnpm 版本進行 frozen lockfile 安裝。
- CI 固定執行翻譯檢查、測試、strict typecheck、lint error gate、production build 與 production audit。
- pnpm lint gate 使用 `pnpm run lint --quiet`，避免參數分隔符被 ESLint 解讀為檔案 pattern。
- CI 額外產生並上傳 VSIX artifact，驗證 manifest 引用檔案及必要靜態資源。
- `pretest` 使用有限次 typecheck，未呼叫 `compile` watch script。
- VSIX package 以 `.vscodeignore` 排除 agent 規範與 `lib/`、`types/` 等開發／中間產物。

完成條件：

- Pull request 能自動攔截測試、型別、打包或資源遺漏。
- 發布流程不依賴本機既有 `node_modules` 狀態。

風險：低。

## P1：型別、安全與可維護性

### P1-1 收斂 queue、事件與設定模型

狀態：✅ 已完成。

> 上調原因：此項直接延續 P0 的 queue finalize、watch cache 與 multi-root scope，優先收斂可降低後續狀態錯亂風險。

已完成：

- `Task.operationType` 已由 optional `string` 改為必填的 `upload | download | delete | rename` union。
- watch `opType` 已由 `{ op: string }` 收斂為 `add | edit | delete | rename` discriminated union；`rename` 必填 `newname`，非 rename operation 不再攜帶 `newname/pathChangeType`。
- `myEvent` 已新增 typed payload union：`update`、`updateMenu`、`refreshNode`、`refreshSyncStatus`；queue terminal state 也改為共用 `TaskTerminalState` 型別。
- 新增明確的 task clone helper；保留共用 config 參照，並複製可變的 `fileChunks`。
- 原始碼中的 `JSON.parse(JSON.stringify(...))` clone 已全部移除。
- watch cache 寫入改存放 operation 副本，避免呼叫端後續修改污染 cache。
- watcher path change 已新增 `pathChangeType` metadata，可區分 same-folder `rename` 與 cross-folder `move`，並在 deploy、upload-on-save 與 output log 傳遞。
- config 讀取已拆成 raw parse、default/migration normalization 與 runtime `name/workspaceRoot` 注入三段，避免設定檔模型與執行期 scope 混在同一層。
- P1-1 直接路徑已移除副作用 `map()` 與鬆散相等；跨全專案的舊寫法清理改由後續型別／安全項目順手處理。

完成條件：

- 未知 operation type 在編譯期可被發現。
- rename、delete、upload、download 的必填欄位由型別保證。
- 自訂事件 payload 缺欄位或錯誤狀態值可在編譯期被發現。
- config cache 只接受 record-shaped sync config，runtime `workspaceRoot` 只在 `toArray()` 注入。

風險：已收斂。

### P1-2 建立 FTP/SFTP client 型別邊界

狀態：✅ 已完成。

已完成：

- 定義並套用 `FTPClientType`、`SFTPClientType`、`FileTransferClient`、`FTPRemoteFileInfo`、`SFTPFileInfo` 與 progress callback 型別。
- `FileTransfer.ts` 的 FTP/SFTP connection pool、queue、get/release client、upload/download/rename/delete/check folder 等核心路徑已移除 `client: any`。
- `treeProvider.ts` 遠端 list item 已改用 `RemoteFileInfo` union，FTP permissions 與 SFTP rights 由型別分支處理。
- `deploy.ts` 已使用 `FileTransferClient` 保存 client 欄位，不再以 `client: any` 傳遞。
- `src` 內 `any` 已降至 11 處，剩餘主要是 `oConsole(...message: any[])`、debounce/throttle 泛型與 `sortFiles()` overload 這類邊界／工具型 `any`。

完成條件：

- `FileTransfer.ts`、`treeProvider.ts` 與 `deploy.ts` 不再以 `client: any` 傳遞核心操作。
- FTP-only／SFTP-only API 由 `FileTransferClient` union 與分支縮窄處理，減少 runtime capability check。

風險：已收斂。

### P1-3 強化 Git 子程序執行

狀態：✅ 已完成。

已完成：

- Git submit path 已改用 `execFile("git", args)`，不再透過 shell 字串執行 `cd ... && git ...`。
- commit message 以 `["commit", "-m", message]` 單一參數傳入，不可能改變命令結構。
- Git 流程拆成固定步驟：`git add .`、`git diff --cached --quiet`、必要時 `git commit -m ...`、最後 `git push`。
- no changes 由 `git diff --cached --quiet` exit code 判斷，不再依賴英文 stdout。
- push failure、authentication failure、timeout／git-not-found 等失敗會以 `[step:kind]` 技術標籤保留結構化資訊與原始 stderr/stdout。
- 新增 git submit 聚焦測試，覆蓋含空格 workspace path、含引號與分號的 commit message、no changes skip commit 但仍 push、push authentication failure。

完成條件：

- 路徑含空格、引號與非 ASCII 字元不需 shell quoting。
- commit message 不可能改變命令結構。
- 可區分 no changes、push failure、authentication failure 與 prompt cancellation／timeout。

風險：已收斂。

### P1-4 完成 i18n/l10n 一致性

狀態：✅ 已完成（2026-08-30）。

現況：

- `package.nls.*.json` 與基準檔案 key 一致。
- 所有 runtime l10n 語系與基準 key 一致，過時的額外 key 已移除。
- `scripts/check-i18n.mjs` 會檢查語系集合、缺少／額外 key，以及原始碼 literal l10n key 是否存在於基準 bundle，並已納入 CI。
- 核心使用者訊息已改用 l10n；Build／建置術語一致，高頻重複 debug／progress log 已移除，技術診斷使用固定結構化標籤。

完成證據：

- 12 份 localized runtime bundle 與基準檔案 key 一致，新增 Workspace Trust、build 與 upload error 翻譯。
- `check:i18n`、strict typecheck、lint error gate 與 75 tests 已通過。

完成條件：

- CI 能偵測缺少或多餘 translation key。
- 13 個支援語系不缺 package 與 runtime 必要字串。

風險：已收斂。

### P1-5 收斂 Workspace Trust 與非同步錯誤邊界

狀態：✅ 已完成（2026-08-30）。

現況：

- Git submit 已使用固定參數與非 shell 執行，該路徑已收斂。
- `config.build` 只允許 trusted workspace 執行；untrusted workspace 會提示開啟 Workspace Trust 管理並要求信任後重試。
- `Deploy.start()` 與 `getIgnoreConfig()` 已改為直接 async function，取消與錯誤不再受 outer Promise executor 影響。
- SSH `unzip` 的遠端 path quoting、能力檢查與 archive entry 安全預檢已由 P3-3 完成。

完成證據：

- 聚焦測試覆蓋 build success／failure、untrusted prompt cancellation、Deploy cancellation 與 ignore cache read/write failure。
- Deploy 取消會保留 `cancelled` 終態，不被 failure finalize 覆寫。

完成條件：

- untrusted workspace 無法觸發本地 shell command。
- build success／failure、prompt cancellation、Deploy cancellation 與 ignore cache 讀寫錯誤均有聚焦測試。

風險：已收斂。

## P2：效能與擴展性

### P2-1 Watch rename lookup 建立索引

狀態：✅ 已完成（2026-07-17）。

> 上調原因：此項最貼近 P0 watcher cache 正確性；先完成索引可避免大量 pending rename 時拖慢 save／rename pipeline。

完成內容：

- 每批由 `Map<newname, Set<source key>>` 建立索引；單次 chain lookup 由掃描 `O(W)` 降為近似 `O(1 + C)`，`C` 是碰撞到相同 target 的來源數。
- 同一 config／workspace 在 50 ms burst 內依到達順序合併，只執行一次 workspaceState read／update；整批複雜度由最差 `O(KW)` 降為 `O(W + K + C)`。
- 部署讀取、cache 清除、clear-all 與 extension deactivate 前都會 flush pending batch，避免遺失最後一批事件。
- 保留 add→delete、add→rename、edit→rename、rename chain、重複 target 與 ignored path policy 語意。
- 合成量測：50,000 pending entries 建索引並套用 1,000 個 chain operations 為 37.7 ms；數值受 Node／硬體影響，測試只驗證行為與單次持久化，不鎖定時間門檻。

殘餘風險：workspaceState 最終仍需序列化完整 pending object；本次消除的是每事件重複掃描與重複寫入，並未改變持久格式。

### P2-2 遠端資料夾下載改為有界並行 traversal

狀態：✅ 已完成（2026-07-17）。

完成內容：

- `downloadTraversalConcurrency` 是每個環境自己的 `sync_config.jsonc` 設定，範圍 1–16、預設 2；設為 `1` 直接走原本 FTP/SFTP 序列 DFS，可完整返回先前行為。
- 有效並行數還會受全域 `SyncTools.uploadConcurrentLimit` 限制；目錄 list 與檔案 transfer 共用同一 config／workspace connection budget，不會各自占滿一份額度。
- 額外 traversal lease 只在額度當下有空位時取得；沒有空位即用現有 client 繼續，避免多個資料夾 traversal 互相等待形成死結。
- 每條 FTP/SFTP client 同一時間只執行一個 list；discovery 完成後再依舊版 DFS 順序一次排入 download tasks。
- 任一目錄 list 失敗時整批 discovery 失敗，不會先排入部分檔案；ignore subtree 仍在 list 前 pruning。
- 合成量測：40 個子目錄、每次 list 延遲 10 ms，設定 1 為 433.0 ms，設定 2 為 224.6 ms，約縮短 48.1%；最大同時 list 數經測試確認不超過 2。

複雜度：總 list／檔案工作量仍為 `O(D + F)`；高延遲下的 list wall-clock 約由 `D × latency` 降為 `ceil(D / L) × latency`，`L` 是實際取得的 traversal clients。

負載與回復方式：設定大於 1 會提高瞬時遠端 CPU、連線與網路 request 負載，但 list 次數與回傳資料總量不增加。低規格 server、嚴格限流或不希望增加瞬時負載時，將 `downloadTraversalConcurrency` 設為 `1`。

### P2-3 Tree Provider cache 生命週期與大型目錄

狀態：✅ 已完成（2026-07-17）。

完成內容：

- `allNodes` 改為 `Map`；refresh、delete、rename、disconnect 與連線失敗共用 iterative subtree eviction，不再掃描其他 config 的全域 key。
- refresh 會先淘汰舊 descendants 再清空 `children`；刪除／rename 也會移除整個舊 subtree，避免 retained stale nodes。
- Tree 完成事件以固定 50 ms 視窗批次處理；同一 parent 只排序及 fire 一次，移除舊版每個 task 固定等待 300 ms 的序列延遲。
- 暫存檔／目錄清理由同步 `rmSync`／`unlinkSync` 改為 `fs.promises.rm`，不再阻塞 Extension Host。
- 10k flat-entry 合成量測：建立並索引 23.7 ms、約保留 8.0 MB；refresh eviction 5.5 ms，索引由 10,001 回到 1，GC 後量測 retained delta 回到 0 MB。

複雜度：排序維持 `O(R log R)`；目標是降低 retained memory 與重複配置。

殘餘風險：單一超大型已展開目錄仍會配置全部可見節點；10k 基線尚可接受，因此未先加入 paging 或顯示上限，避免改變 Tree 操作語意。

### P2-4 本地檔案 traversal 避免阻塞 Extension Host

狀態：✅ 已完成（2026-07-17）。

完成內容：

- `getAllFiles()` 改為 `fs.promises.lstat` 與 `readdir({ withFileTypes: true })`，避免每個 entry 重複 stat；目錄 I/O 由 limiter 控制。
- `localTraversalConcurrency` 是每個環境自己的 `sync_config.jsonc` 設定，範圍 1–16、預設 4；設為 `1` 仍是非阻塞序列 I/O，可降低本機磁碟瞬時負載。
- `Promise.all(...).flat()` 依 readdir entry 順序組合結果；ignore subtree pruning、negation restore、symlink 當檔案與掃描中 ENOENT 跳過語意均保留。
- 以相同 fixture 比較舊同步 traversal 與新設定 4：1k 為 25.7→6.3 ms（timer delay 25.8→1.1 ms）；10k 為 281.8→52.1 ms（282.1→0.3 ms）；50k 為 1,354.8→194.5 ms（1,354.9→5.3 ms）。
- 設定 1 的另一次 10k 量測為 37.2 ms、timer delay 1.1 ms；即使選擇最低負載模式，也不會返回舊版同步阻塞行為。

複雜度：總 filesystem 工作量仍為 `O(D + F)`；改善來自移除重複 stat、非阻塞 I/O 與有限重疊等待時間。

殘餘風險：取消與進度顯示尚未加入 traversal API；目前 queue／部署層仍可在排入 transfer tasks 前取消後續流程，若未來加入超大型掃描 UI 再另案處理。

## P3：產品體驗與新功能

P3-1～P3-5 已完成：

- 拖曳本機檔案支援標準 URI list、取消與持久確認設定；遠端移動以 config/workspace scope 驗證來源，使用 POSIX path，拒絕跨連線、目的地碰撞與資料夾移入自身。
- queue finalize 將完成、失敗、取消與停止狀態一致發布到 Tree View、Status Bar 與 UI event，並使用 13 個 runtime bundle 的本地化字串。
- SSH 自動解壓縮會先確認 `unzip` 可用，安全引用 archive／destination path，列出 ZIP 項目並阻擋絕對路徑、磁碟機路徑與 `..` 上層穿越，再依精確 exit code 判斷結果。
- SSH `.zip` Tree 節點新增右鍵解壓縮命令；使用者確認可能覆寫後，解壓至壓縮檔所在目錄並刷新父節點。
- Tree View 與 Explorer 的單檔比對每次重新取得遠端內容，統一本機在左、遠端在右，且不接受資料夾。
- 聚焦測試涵蓋取消、跨工作區、碰撞、自身移動、client release、ZIP command injection／path traversal／能力／exit code、終態 UI 與 fresh remote diff。

剩餘 P3-6 雙向同步在開始前應先定義：

- 使用者流程與取消行為。
- FTP、SFTP、SSH 能力差異。
- 衝突處理與資料覆蓋確認。
- 大量檔案時的 progress 與錯誤彙總。

## 建議執行里程碑

| 里程碑 | 內容 | 預期結果 |
| --- | --- | --- |
| M1：可靠性 | P0-1、P0-2、P0-3、P0-4 | 任務終態、ignore、multi-root 與發布流程可預期。 |
| M2：核心重構 | P1-1、P1-2、P1-3 | 降低 `any`、shell 與 queue 模型風險。 |
| M3：擴展性 | P2-1、P2-2、P2-3、P2-4 | ✅ 大型工作區與高延遲 server 已具量測、改善與可回復的負載設定。 |
| M4：產品功能 | P1-4、P1-5、P3-1～P3-5 | ✅ 已在穩定核心上補齊翻譯、信任邊界、拖曳／移動、SSH ZIP 與單檔差異體驗；P3-6 另案處理。 |

## 暫不處理

- 不直接修改 vendored `src/lib/ssh2-sftp-client`，除非決定正式維護 fork。
- 不為消除全部 lint warning 進行全專案格式化；應配合實際修改逐步收斂。
- 10k Tree baseline 尚未顯示 paging 的必要性；未出現實際門檻前不導入複雜 cache framework。
- 不在任務終態與衝突策略穩定前開始雙向同步 UI。

## 每項改進的完成標準

- 行為有聚焦測試，涵蓋正常、空值、重複、錯誤、取消與平台路徑差異。
- `npm test` 通過。
- `npm run typecheck:strict` 通過。
- `corepack pnpm run lint --quiet` 通過。
- `npm run package` 通過。
- 正式依賴變更後 `pnpm audit --prod` 無高風險問題。
- 發布相關變更需實際建立 VSIX 並檢查內容。
- 效能改進需附前後 measurement；只有理論複雜度說明不足以宣告完成。
