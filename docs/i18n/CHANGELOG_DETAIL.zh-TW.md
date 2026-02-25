# 詳細變更追蹤（繁體中文）

> 用於記錄每次版本的詳細改動，便於後續追蹤、回溯與驗證。

## v0.6.0（2026-02-24）

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

### 功能新增
- 

### 修正項目
- 

### 實作細節
- 

### 文件更新
- 

### 驗證結果
- 
```
