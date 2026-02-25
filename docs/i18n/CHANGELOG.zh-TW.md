# 更新日誌

## v0.6.0
- 新增 `syncFileTime` 設定，支援上傳後同步遠端檔案時間（FTP/SFTP/SSH）。
- 新增 `skipIfSameSize` 設定，上傳前比對遠端檔案大小與修改時間，相同則跳過（預設 true）。
- 新增 `uploadDelay` 設定，最後一次修改後延遲指定秒數再上傳（防抖；預設 0，即時上傳）。
- 修正 SFTP 檔案時間同步，透過底層 ssh2 `utimes` 呼叫與 `exec touch` 回退機制。
- 修正 Windows 建置相容性（`package` 腳本、webpack ts-loader `transpileOnly`）。
- 更新所有 13 種語系的設定範本。
- 補回 `privateKeyPath` 與 `secretKeyPath` 至預設設定範本與範例生成內容。
- 調整認證流程：`sftp/ssh` 優先使用 `privateKeyPath`，不可用時回退 `password`。
- 新增明確驗證錯誤訊息（FTP 僅支援密碼、私鑰路徑無效且無密碼等情境）。
- 同步認證優先序與執行期錯誤訊息至所有語系 README。
- 修正 MOVE/rename 在 Windows 路徑分隔符情境下只上傳新檔、不移動遠端舊檔的問題；現在會正確執行遠端 rename。
- 修正 `uploadDelay` 行為為真正防抖：最後一次修改後延遲 N 秒才上傳，避免頻繁修改時重複上傳。
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
