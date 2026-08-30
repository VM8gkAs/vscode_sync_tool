# FTP/SFTP/SSH 同步  

> 快速代碼同步工具  

[🔥 下載地址](https://marketplace.visualstudio.com/items?itemName=oorzc.ssh-tools)  

## Supported Languages

- [English](../../README.md)
- [简体中文](README.zh-CN.md)
- [Español](README.es.md)
- [Français](README.fr.md)
- [Deutsch](README.de.md)
- [Italiano](README.it.md)
- [한국어](README.ko.md)
- [Português](README.pt.md)
- [Pусский](README.ru.md)
- [Türkçe](README.tr.md)
- [Polski](README.pl.md)
- [日本語](README.ja.md)

## ✨ 插件功能  

- [x] 支援自定義配置多個開發環境  
- [x] 支援即時同步程式碼  
- [x] 支援記錄變動程式碼，手動上傳程式碼  
- [x] 支援自動構建打包前端專案  
- [x] 支援程式碼壓縮上傳（但只有SSH支援上傳後遠端解壓縮）  
- [x] 支援上傳時提交到Git  
- [x] 支援自定義上傳目錄和排除不上傳目錄  
- [x] 支援並發上傳、下載  
- [x] 支援暫停上傳下載，恢復上傳下載，停止上傳下載  
- [x] 支援本地、遠端檔案比對  
- [x] 支援查看遠端程式碼，可以進行增刪改查、修改權限、移動程式碼、重新命名、下載檔案等操作  
- [x] 支援設定代理  
- [x] 支援拖曳上傳檔案或資料夾到伺服器指定目錄  
- [x] 👍👍👍支援對配置檔案中的帳戶、密碼進行加密，防止伺服器帳戶洩露👍👍👍  

## 📖 使用指南  

1. **插件配置**  
   • 預設忽略的檔案/目錄：`.git`, `.svn`, `.DS_Store`, `Thumbs.db`, `.idea`, `node_modules`, `runtime`, `sync_config.jsonc`  
   • 支援 `.gitignore` 規則（如果存在）  
   ![忽略規則](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F2a2b4adc7305c7b1c84d796da57cfe81.png)  

2. **新增專案配置**  
   ![配置嚮導](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F0aba393b99df91a094fac6c14a2aebe1.gif)  

3. **代理設置**  
   • 需在專案配置中設置 `proxy = true`  
   ![代理配置](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F9f00f0451dd2c558ad469178d0058713.png)  

4. **遠端 ZIP 解壓縮與檔案比對**
   - 在 Sync Tools Tree View 對 SSH `.zip` 檔案按右鍵，選擇 **解壓縮遠端 ZIP**；確認後會解壓縮至壓縮檔所在目錄，既有檔案可能被覆寫。
   - 遠端伺服器必須提供 `unzip` 命令。遠端路徑會以 POSIX shell 參數安全引用，含絕對路徑、磁碟機路徑或 `..` 上層穿越項目的 ZIP 會在解壓縮前被拒絕。
   - **比對檔案**每次都會重新下載遠端內容，並以本機檔案在左、遠端檔案在右開啟 VS Code diff；不接受資料夾。

**`sync_config.jsonc` 範例**  

```jsonc
{
   // 環境名稱（可自定義）
   "test": {
         // 測試環境
         "type": "ftp", // 必填：ftp/sftp/ssh  
         "host": "0.0.0.0", // 必填：伺服器地址  
         "port": 22, // 選填：端口（預設 ftp 為 21，sftp/ssh 為 22）  
         "username": "username", // 必填：登入用戶名  
         "password": "password", // 登入密碼或私鑰路徑  
         // "privateKeyPath": "/path/to/id_rsa", // SSH/SFTP 私鑰路徑（避免放在根目錄）  
         // "secretKeyPath": "/your_path/secret_key.txt", // 加密私鑰路徑，用於加密用戶名和密碼。注意：最好不要將密鑰放在代碼目錄下。
         "proxy": false, // 使用代理（需在配置中設置 `proxy: true`）  
         "upload_on_save": false, // 保存後自動上傳（不建議團隊使用）  
         "watch": true, // 監控檔案變動（若 `upload_on_save: true` 則無效）  
         "submit_git_before_upload": true, // 上傳前提交 Git（適合團隊使用）  
         "submit_git_msg": "", // 提交訊息（若 `submit_git_before_upload: true` 則必填）  
         "build": "yarn build:test", // 構建命令（選填）  
         "compress": true, // 上傳前壓縮檔案  
         "deleteRemote": false, // 上傳前刪除遠端目錄  
         "syncFileTime": false, // 上傳後是否同步遠端檔案時間（使用本地檔案時間），預設 false
         "skipIfSame": true, // 上傳前檢查遠端檔案是否相同，相同則跳過，預設 true
         "skipCompareMode": "size+mtime", // 跳過比對標準："size+mtime"（預設）、"size"、"mtime"
         "uploadDelay": 0, // 最後一次修改後延遲上傳秒數（防抖），預設 0（即時上傳）
         "remotePath": "/www/wwwroot/test", // SFTP/SSH 伺服器路徑  
         "excludePath": [], // 排除規則（與 .gitignore 合併）  
         "default": true // 設為預設環境  
   },
   "online": {
         // 正式環境
         "type": "sftp",
         "host": "0.0.0.0",
         "port": 22,
         "proxy": true,
         "username": "username",
         "password": "password",
         "upload_to_root": false,
         "remotePath": "/www/wwwroot/online",
         "default": false
   }
}

```

### 外部配置檔案儲存

- 執行 **Sync Tools: 選擇配置檔案儲存目錄**，可將 `sync_config.jsonc` 移出工作區，降低帳號憑證被提交到版本控制的風險。
- 每個工作區使用 `<所選目錄>/<專案名稱>-<8 字元雜湊>/sync_config.jsonc`；同名專案仍會彼此隔離。
- 所選目錄必須是所有已開啟工作區之外的絕對路徑，且不會覆寫既有目標檔案。
- 執行 **Sync Tools: 重置配置檔案儲存路徑（使用專案根目錄）** 可搬回專案根目錄；取消遷移不會改變目前位置。

### 認證優先序與驗證錯誤訊息

- `sftp` / `ssh` 會優先使用 `privateKeyPath`，不可用時才回退使用 `password`。
- `ftp` 僅支援 `password` 認證。
- 執行期驗證訊息如下：

```text
FTP only supports password authentication. Please configure [password]
The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password
Please configure authentication: [privateKeyPath] (preferred) or [password]
```

```js
// excludePath、downloadExcludePath 排除規則，支援萬用字元
[
   "**/*.mp4",
   "aaa/bbb", //排除aaa/bbb
   "!aaa/bbb/ccc", //不排除aaa/bbb下面的ccc資料夾
]
```

## 上傳演示  

![上傳演示](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F8f85ff0142ef082749b55f7db3c8bf13.gif)  

## 檔案比對演示  

![比對演示](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F6cbd149ae7959c8097ce288fb91ed800.gif)  

## Build Commands

```bash
# 安裝相依套件
npm install

# 開發模式（watch 增量編譯）
npm run watch

# 生產環境打包（輸出 dist/extension.js）
npm run package

# 打包 VSIX（輸出 ssh-tools-<version>.vsix）
npx @vscode/vsce package --no-dependencies
```

- `npm run package` 僅建置 extension bundle，不會產生 `.vsix` 檔案。
- `npm run vscepackage` 需要全域安裝 `vsce`；若未安裝，建議使用 `npx @vscode/vsce package --no-dependencies`。

## 溫馨提示  

1. 如果您無法連接伺服器，可以嘗試使用其他連接工具，比如 xftp、filezilla 等工具連接伺服器，沒有問題之後再嘗試連接。
2. 上傳檔案後，如果樹狀選單沒有更新，可以使用右鍵選單，刷新檔案樹。
3. 為什麼重複打開檔案時，沒有從伺服器下載檔案？為了節省資源，插件會快取已打開的檔案。如果需要更新檔案，請使用右鍵選單，刷新即可。
4. 為什麼無法解密用戶名或密碼？您的密鑰已修改，請重新填寫初始帳戶密碼，再加密解密。
5. 每次編輯配置檔案，都會自動停止所有任務。因此在上傳期間，請不要隨意修改配置檔案。

## 問題回報  

此為社群驅動的專案，若有問題請在此回報：  
[提交問題](https://github.com/oorzc/vscode_sync_tool/issues)  
