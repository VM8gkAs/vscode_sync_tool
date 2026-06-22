# FTP/SFTP/SSH Sync Tool — 開發快速入門

## 專案結構

```
vscode_sync_tool/
├── src/
│   ├── extension.ts          # 擴充功能入口（activate / deactivate）
│   ├── FileTransfer.ts       # 核心上傳/下載/連線池管理
│   ├── treeProvider.ts       # 側邊欄樹狀檔案瀏覽器
│   ├── deploy.ts             # 建置與部署流程
│   ├── CodeLensProvider.ts   # 編輯器內 Code Lens 按鈕
│   ├── FileProvider.ts       # 遠端檔案內容讀取
│   ├── output.ts             # Output Channel 管理（oConsole）
│   ├── statusBar.ts          # 狀態列互動
│   ├── utils.ts              # 工具函式（路徑處理、設定讀取、加解密等）
│   ├── config/
│   │   ├── default.ts        # 13 語系設定範本與 SCHEMA_FIELDS
│   │   ├── config.ts         # 設定常數
│   │   └── globals.ts        # 全域變數
│   ├── events/
│   │   ├── uploadOnSave.ts   # 儲存即上傳邏輯
│   │   └── myEvent.ts        # 自訂事件
│   ├── types/
│   │   ├── config.ts         # DeployConfigItem 介面定義
│   │   ├── connect.ts        # 連線型別
│   │   └── sftp.ts           # SFTP Client 型別
│   └── lib/
│       └── ssh2-sftp-client/  # 內建 SFTP Client 封裝
├── l10n/                      # VS Code L10n 翻譯檔
├── package.nls.*.json         # package.json 國際化字串
├── static/                    # 圖示與靜態資源
├── docs/                      # 文件
├── package.json               # 擴充功能清單
├── tsconfig.json              # TypeScript 設定
└── webpack.config.js          # Webpack 打包設定
```

## 環境準備

1. 安裝相依套件：
   ```bash
   npm install
   ```

2. 安裝建議的 VS Code 擴充功能：
   - `amodio.tsl-problem-matcher`
   - `dbaeumer.vscode-eslint`

## 常用指令

```bash
# 開發模式（watch + 增量編譯）
npm run watch

# TypeScript 型別檢查（不產出檔案）
npm run typecheck

# 嚴格型別檢查（含第三方 .d.ts）
npm run typecheck:strict

# 生產環境打包（輸出 dist/extension.js）
npm run package

# 打包 VSIX（輸出 ssh-tools-<version>.vsix）
npx @vscode/vsce package --no-dependencies
```

> **注意**：`npm run package` 僅建置 bundle，不會產生 `.vsix` 檔案。
> 型別檢查策略詳見 [typecheck-strategy.md](../typecheck-strategy.md)。

## 啟動與除錯

1. 按 `F5` 啟動 Extension Development Host 視窗。
2. 在 Command Palette（`Ctrl+Shift+P`）中輸入 `FTP` 或 `Sync` 即可找到本擴充功能的指令。
3. 在 `src/extension.ts` 或其他檔案中設定中斷點即可進行除錯。
4. 修改程式碼後，可按 `Ctrl+R` 重新載入 Extension Development Host 視窗。

## 測試

1. 開啟 Debug 面板（`Ctrl+Shift+D`），選擇 `Extension Tests` 設定。
2. 按 `F5` 執行測試。
3. 測試檔案位於 `src/test/suite/`，檔名需符合 `**.test.ts` 格式。

## 國際化 (i18n)

本專案使用 VS Code L10n 機制，支援 13 種語言。

```bash
# 匯出翻譯字串
npx @vscode/l10n-dev export -o ./l10n ./src
```

- 執行期翻譯檔：`l10n/bundle.l10n.*.json`
- `package.json` 字串：`package.nls.*.json`
- 設定範本：`src/config/default.ts` 內的各語系模板

## 發布

```bash
# 發布至 VS Code Marketplace
npx @vscode/vsce publish patch   # 遞增修訂版號
npx @vscode/vsce publish minor   # 遞增次版號
npx @vscode/vsce publish major   # 遞增主版號

# 發布至 Open VSX（VSCodium）
npx ovsx publish -p <OVSX_TOKEN>
```

## VS Code API 常用片段

### 訊息 API

```ts
vscode.window.showInformationMessage('info message');
vscode.window.showWarningMessage('warning message');
vscode.window.showErrorMessage('error message');

vscode.window
  .showErrorMessage('Remote interaction requires configuration', 'Open Settings')
  .then(selection => {
    if (selection === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings');
    }
  });
```

### 輸入框

```ts
const text: string | undefined = await vscode.window.showInputBox({
  prompt: 'Enter value'
});
```

### 快速選擇

```ts
const lang: string | undefined = await vscode.window.showQuickPick(
  ['en', 'zh', 'ja'],
  { placeHolder: 'Select language' }
);

const option = await vscode.window.showQuickPick(
  [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' }
  ].map(v => ({ label: v.name, description: String(v.id) })),
  { placeHolder: 'Select an option' }
);
```

## 參考資源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [`when` clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts#conditional-operators)
- [Built-in codicons](https://code.visualstudio.com/api/references/icons-in-labels#icon-in-labels)
- [Extension Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
