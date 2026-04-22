# vscode_sync_tool 程式碼整體分析報告

> 最後更新：2026-04-21

根據對專案原始碼的掃描與分析，目前專案存在以下幾類可改進項目與未完成功能：

## 1. 程式碼品質與維護性改進

> 以下項目已於 v0.6.1 全數完成，詳見 [CHANGELOG_DETAIL](i18n/CHANGELOG_DETAIL.zh-TW.md#v061202603-27)。

- ✅ 錯誤捕捉 (Error Handling) 的空區塊：為所有空 `catch` 區塊加上語意明確的註解
- ✅ 殘留的 `console.log` / `console.error` / `console.warn` 統一替換為 `oConsole.*`
- ✅ 資料夾重命名同步問題：新增 `renamingFolderPrefixes` 過濾機制
- ✅ `treeProvider.ts` 型別錯誤修復（`iconPath` / `l10n.t()`）
- ✅ 連線池清理邏輯修復：`startCleanupTimer` 內 `return` → `continue`
- ✅ `shouldSkipUpload` 中 `skipIfSameSize` 死碼 fallback 移除
- ✅ `uploadFile` 的 `new Promise(async ...)` 反模式修正為直接 `async` 函式
- ✅ `uploadFile` 的 `ReadStream` 資源洩漏修正：移除未消費的 ReadStream，直接使用檔案路徑
- ✅ `uploadOnSave` 預先 `getClient` 浪費修復：移除不必要的連線取得
- ✅ `syncRemoteFileTime` 中冗餘的 `console.warn` 移除
- ✅ Windows 路徑遍歷修正：所有遠端路徑改用 `path.posix.join` + `posixRelative()`
- ✅ 新增 `skipIfSame` + `skipCompareMode` 設定
- ✅ `.vscode/` 加入 `.gitignore`
- ✅ FTP 空檔案寫入空格副作用修正：改用暫存檔上傳，上傳後自動清理，本地檔案不再被修改
- ✅ 連線池穩健性強化：`cleanupConnectionPool` 加入 `maxIdle` 上限及 try-catch 保護；`releaseClient` 超出 `maxConnections` 時直接關閉；所有 `close()`/`end()` 均以 try-catch 包裹

**尚未處理**：

### 🟡 過度依賴 `any` 型別 (Type Safety) — 難度：中

全專案約 **68 處** 使用 `any`，分佈如下：

| 檔案 | `any` 數量 | 主要類型 | 修正難度 |
|------|-----------|---------|---------|
| `FileTransfer.ts` | ~29 處 | `client: any`（FTP/SFTP client）、callback 參數 | 🟡 中（需定義 `IFtpClient` / `ISftpClient` 介面） |
| `utils.ts` | ~14 處 | `oConsole` 參數、config parsing、泛型工具函式 | 🟢 低（多數可直接改為 `unknown` 或具體型別） |
| `treeProvider.ts` | ~6 處 | `client: any`、檔案列表、callback | 🟢 低（可復用 FileTransfer 定義的介面） |
| `config.ts` / `sftp.ts` | ~4 處 | `sock: any`、事件 callback | 🟢 低 |
| 合計 | ~53 處有效 `any` | — | — |

> 其中約 15 處是泛型工具函式（`debounce`, `throttle`, `...args: any[]`）或 `oConsole` 的 rest 參數，屬於合理使用，可暫不處理。
>
> **核心問題**在 `client: any`（約 20 處），因為 FTP Client（`basic-ftp-proxy`）和 SFTP Client（`ssh2-sftp-client`）沒有共用介面。修正方式需要定義 `ITransferClient` 統一介面或使用聯合型別 `FtpClient | SftpClient`，影響範圍廣但風險低。

### ~~🟡 連線池穩健性強化 — 難度：中~~ ✅ 已完成

`FileTransfer.ts` 中的 FTP/SFTP 連線池已加入以下改進：
- `cleanupConnectionPool` 支援 `maxIdle` 參數，超出限制的閒置連線會先被關閉
- 所有 `client.close()` / `client.end()` 呼叫均包裹 try-catch，防止清理已斷線連線時拋錯
- `releaseClient` 在池已滿（`>= maxConnections`）時直接關閉連線而非放回

### ~~🟢 FTP 空檔案寫入空格副作用 — 難度：低~~ ✅ 已完成

`uploadFile` FTP 分支改用暫存檔（`localPath + '.ftp_tmp'`）寫入空格字元上傳，上傳完畢後在 `finally` 區塊清理暫存檔。本地原始檔案不再被修改，`skipIfSame` 比對不再受影響。

## 2. 未完成功能 (TODO 標記)

在 `src/extension.ts` L36-42 中，開發者留下了多個 `TODO` 標記：

### 🟢 容易實現 + 高價值
- **Watch 緩存清理**：目前 `watch` (監聽) 上傳後可能未完全清空暫存（錯誤 retry 達上限時 `allTaskCompleted` 不會被呼叫）。
- **多國語系翻譯更新**：還有部分的文案需要補齊多國語言 (i18n / l10n) 翻譯。

### 🟡 中等難度 + 高價值
- **拖曳上傳確認**：目前拖曳上傳缺少防呆確認機制，需加入「拖曳上傳是否需要確認功能」。
- **忽略檔案 (.gitignore) 邏輯完善**：需要檢查「忽略檔案的上傳提交」以及新增「下載忽略檔案」的相關測試。
- **同步狀態更新**：當有同步任務進行時，需自動刷新介面上的同步狀態。

### 🔴 較高難度 / 需要較多設計
- **釋放 Git 操作**：計畫優化或釋放 `exec` 執行的 Git 操作，避免行程阻塞或資源佔用。
- **SSH 壓縮 / 解壓縮功能完善**：目前 SSH 的壓縮上傳與解壓縮還有優化空間。
- **SSH 右鍵解壓縮**：計畫加入遠端 SSH 右鍵直接解壓縮的功能。
- **雙向同步功能介面 (Sync Diff UI)**：缺乏類似 PyCharm 或 WinSCP 般直觀的上下方雙向同步與差異比對介面。

---
**總結**：
專案 v0.6.1 已完成所有 Tier 1 程式碼品質改進（含路徑修正、日誌統一、反模式修正、資源洩漏修復等）。接下來的優化方向主要為：**加強 TypeScript 型別安全**（`any` → 具體介面，核心約 20 處）、**連線池邊界處理**與**實作表列的各項 TODO 體驗優化**。
