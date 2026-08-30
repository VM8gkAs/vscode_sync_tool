# FTP/SFTP/SSH Sync 

> A tool for rapid code synchronization

[🔥 Download Link](https://marketplace.visualstudio.com/items?itemName=oorzc.ssh-tools)

## Supported Languages

- [简体中文](docs/i18n/README.zh-CN.md)
- [繁體中文](docs/i18n/README.zh-TW.md)
- [Español](docs/i18n/README.es.md)
- [Français](docs/i18n/README.fr.md)
- [Deutsch](docs/i18n/README.de.md)
- [Italiano](docs/i18n/README.it.md)
- [한국어](docs/i18n/README.ko.md)
- [Português](docs/i18n/README.pt.md)
- [Pусский](docs/i18n/README.ru.md)
- [Türkçe](docs/i18n/README.tr.md)
- [Polski](docs/i18n/README.pl.md)
- [日本語](docs/i18n/README.ja.md)

## ✨ Plugin Features

- [x] Supports custom configuration of multiple development environments  
- [x] Supports real-time code synchronization  
- [x] Supports tracking code changes and manually uploading code  
- [x] Supports automatic building and packaging of front-end projects  
- [x] Supports code compression and upload (but only SSH supports remote decompression after upload)  
- [x] Supports committing to Git during upload  
- [x] Supports custom upload directories and excluding specific directories from upload  
- [x] Supports concurrent upload and download  
- [x] Supports pausing, resuming, and stopping uploads and downloads  
- [x] Supports local and remote file comparison  
- [x] Supports viewing remote code, with operations like adding, deleting, modifying, changing permissions, moving code, renaming, and downloading files  
- [x] Supports proxy settings  
- [x] Supports drag-and-drop upload of files or folders to specified server directories  
- [x] 👍👍👍 Supports encryption of account and password in configuration files to prevent server account leaks 👍👍👍  

## 📖 Usage Instructions

1. Plugin Configuration

    - By default, the .git, .svn, .DS_Store, Thumbs.db, .idea, node_modules, runtime, and sync_config.jsonc files and folders are ignored. You can add others manually.
    - If there is a .gitignore configuration file, it will be used by default to ignore the content to be uploaded.
      ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F2a2b4adc7305c7b1c84d796da57cfe81.png)

2. Adding Project Configuration
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F0aba393b99df91a094fac6c14a2aebe1.gif)

3. Proxy Settings. The proxy will only take effect if you also set `proxy = true` in the project configuration below.
   ![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F9f00f0451dd2c558ad469178d0058713.png)

4. Output Logs

    - Output history remains available until you run **Sync Tools: Clear All Log**. The newest entries are retained according to `SyncTools.logNumberLimit`.
    - To persist the same information to disk, add these workspace settings:

      ```jsonc
      "SyncTools.logToFile": true,
      "SyncTools.logDirectory": "sync_logs"
      ```

    - Logs are appended to `<workspace>/<logDirectory>/sync-tools.log`. The directory must be relative to the workspace and is excluded from synchronization while file logging is enabled.

### sync_config.jsonc Configuration Reference

```jsonc
{
    // Environment name, supports custom names
    "test": {
        // Test environment
        "type": "ftp", // (Required) Transfer type, supports ftp, sftp, ssh
        "host": "0.0.0.0", // (Required) Server address
        "port": 22, // (Optional) Port number. Default is 21 for ftp, 22 for sftp and ssh
        "username": "username", // (Required) Login username
        "password": "password", // Login password (choose one between this and private key path)
        // "privateKeyPath": "/your_path/id_rsa", // (For sftp, ssh configuration) Private key path (choose one between this and login password). Note: It's best not to put the key in the code root directory
        // "secretKeyPath": "/your_path/secret_key.txt", // Path to the encryption private key, used for encrypting usernames and passwords. Note: It is best not to place the key in the code directory.
        "proxy": false, // Whether to use a proxy, default is false
        "upload_on_save": false, // Submit code in real-time after saving. It's recommended for single developers. When upload_on_save is set to true, watch, submit_git_before_upload, compress, and deleteRemote are invalid. Default is false
        "watch": false, // Monitor file changes in the upload directory. Default is true. If upload_on_save is true, this option is invalid. If the distPath directory is configured, only file changes under the distPath directory will be monitored
        "submit_git_before_upload": true, // For team development. Commit local Git before uploading code to prevent overwriting remote code. Default is false
        "submit_git_msg": "", // Configuration for the commit message of Git. Default is empty. When submit_git_before_upload is true and this field is not filled, a prompt box will pop up for manual input
        // "build": "yarn build:test", // (Optional) Command to execute for building. Open this option if it's a front-end project
        "compress": true, // Whether to upload in compressed form. Default is false
        //"remote_unpacked": true, // Whether to unpack remotely after compressed upload (requires SSH support). Default is true for SSH, false for others
        //"delete_remote_compress": true, // Whether to delete the remote compressed file after uploading the compressed file. Default is true for SSH, false for others
        //"delete_local_compress": true, // Whether to delete the local compressed file after uploading the compressed file. Default is true
        "distPath": [], // (Optional) Local directories to be uploaded. Supports strings or arrays. Default is to upload the root directory
        "upload_to_root": false, // If only one directory is configured in distPath, upload it to the root of the remotePath. Generally used for deploying front-end code. Default is false
        "deleteRemote": false, // Whether to delete the remote distPath directory before uploading. Generally used for cleaning up front-end deployment code. Default is false
        "syncFileTime": false, // Whether to sync remote file timestamp after upload (using local file time). Default is false
        "skipIfSame": true, // Whether to check remote file before upload and skip when identical. Default is true
        "skipCompareMode": "size+mtime", // Comparison mode for skip check: "size+mtime" (default), "size", "mtime"
        "uploadDelay": 0, // Debounce seconds after last change before uploading. Default is 0 (immediate). Only affects upload_on_save mode
        "remotePath": "/www/wwwroot/test", // (For sftp, ssh configuration) Server address for upload
        "excludePath": [], // (Optional) Files and directories to be excluded from upload in the current environment. It will be merged with the plugin's excludePath configuration. When the plugin uses gitignore, it will be merged with the .gitignore configuration file
        // "downloadPath": "" // (Optional) Download path. Default is the current project root directory. Used when manually downloading files or folders. You can specify a download address
        // "downloadExcludePath": [], //  (Optional) Files and directories to be excluded from download
        "localTraversalConcurrency": 4, // Local directory scan concurrency (1-16). Use 1 for serial asynchronous I/O and the lowest instantaneous disk load. Default is 4
        "downloadTraversalConcurrency": 2, // Remote download directory scan concurrency (1-16). Use 1 to restore the previous serial traversal behavior. Default is 2
        "default": true // Whether it's the default environment. When set to true, you can use the right-click menu to quickly upload files or folders and compare with remote files. Default is false
    },
    "online": {
        // Production environment
        "type": "sftp",
        "host": "0.0.0.0",
        "port": 22,
        "proxy": true,
        "username": "username",
        "password": "password",
        // "privateKeyPath": "/your_path/id_rsa",
        "upload_on_save": false,
        "watch": false,
        "submit_git_before_upload": true,
        "submit_git_msg": "",
        // "build": "yarn build:online",
        "compress": false,
        //"remote_unpacked": false,
        //"delete_remote_compress": true,
        "upload_to_root": false,
        "deleteRemote": false,
        "syncFileTime": false,
        "distPath": [],
        "remotePath": "/www/wwwroot/online",
        "excludePath": [],
        // "downloadPath": "",
        // "downloadExcludePath": [],
        "default": false
    }
}
```

### Traversal Performance Controls

- `localTraversalConcurrency` and `downloadTraversalConcurrency` belong to each environment in `sync_config.jsonc`, so a low-capacity server can use different limits from another server.
- `localTraversalConcurrency: 1` uses serial, non-blocking local I/O and minimizes instantaneous disk load. The default `4` overlaps a small number of directory reads without changing file order or ignore rules.
- `downloadTraversalConcurrency: 1` restores the previous FTP/SFTP serial directory traversal. Values above `1` can reduce high-latency folder discovery time, but increase simultaneous remote requests, connection use, and network activity. The default is `2`.
- Remote traversal and file transfers share the `SyncTools.uploadConcurrentLimit` connection budget. The effective traversal concurrency never exceeds that global limit, and automatically falls back to fewer clients when no spare lease is available.
- A remote directory-listing failure aborts that discovery batch before any partial download tasks are queued.

### External Configuration Storage

- Run **Sync Tools: Select Config Store Directory** to move `sync_config.jsonc` outside the workspace and reduce the risk of committing credentials.
- Each workspace uses `<selected directory>/<project name>-<8-character hash>/sync_config.jsonc`; workspaces with the same folder name remain isolated.
- The selected directory must be an absolute path outside every open workspace. Existing target files are never overwritten.
- Run **Sync Tools: Reset Config Store Path (Use Project Root)** to copy configurations back to their project roots. Cancelling a migration leaves the current location unchanged.
- Configuration storage is independent of `sync_config.jsonc` traversal settings and does not change remote upload paths.

### Authentication Priority & Validation Errors

- For `sftp` / `ssh`, authentication tries `privateKeyPath` first; if it is unavailable, it falls back to `password`.
- For `ftp`, only `password` authentication is supported.
- Runtime validation messages:

```text
FTP only supports password authentication. Please configure [password]
The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password
Please configure authentication: [privateKeyPath] (preferred) or [password]
```

```js
// Exclusion rules for excludePath and downloadExcludePath, support wildcards
[
    "**/*.mp4",
    "aaa/bbb", // Exclude aaa/bbb
    "!aaa/bbb/ccc", // Do not exclude the ccc folder under aaa/bbb
]
```

## Upload Demonstration

Upload demonstration
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F8f85ff0142ef082749b55f7db3c8bf13.gif)

File comparison demonstration
![](https://cdn.jsdelivr.net/gh/oorzc/public_img@main/img/2024%2F11%2F12%2F6cbd149ae7959c8097ce288fb91ed800.gif)

## Build Commands

```bash
# install dependencies
npm install

# development watch build
npm run watch

# production build (output: dist/extension.js)
npm run package

# package VSIX (output: ssh-tools-<version>.vsix)
npx @vscode/vsce package --no-dependencies
```

- `npm run package` only builds the extension bundle, it does not generate a `.vsix` file.
- `npm run vscepackage` requires globally installed `vsce`; if not installed, prefer `npx @vscode/vsce package --no-dependencies`.

## Development Notes

### i18n extraction

```bash
npx @vscode/l10n-dev export -o ./l10n ./src
```

### Publish commands

```bash
# package locally
npx @vscode/vsce package --no-dependencies

# publish to VS Code Marketplace
npx @vscode/vsce publish
npx @vscode/vsce publish major
npx @vscode/vsce publish minor
npx @vscode/vsce publish patch
npx @vscode/vsce publish 0.0.4

# publish to Open VSX (VSCodium)
npx ovsx publish -p <OVSX_TOKEN>
# or set env var OVSX_PAT then run ovsx publish
```

### VS Code references

- `when` clause contexts: https://code.visualstudio.com/api/references/when-clause-contexts#conditional-operators
- Built-in codicons in labels: https://code.visualstudio.com/api/references/icons-in-labels#icon-in-labels

### Type-check strategy

- Decision note: `docs/typecheck-strategy.md`
- Quick commands: `npm run typecheck`, `npm run typecheck:strict`

## Friendly Reminder

1. If you are unable to connect to the server, you can try using other connection tools such as xftp, filezilla, etc. to connect to the server. Once confirmed, you can try connecting again.
2. After uploading files, if the tree menu is not updated, you can use the right-click menu to refresh the file tree.
3. Why is the file not downloaded from the server when reopening it? To save resources, the plugin caches opened files. If you need to update the file, please use the right-click menu and refresh it.
4. Why can't the username or password be decrypted? Your key has been modified. Please re-enter the initial account password and encrypt/decrypt again.
5. Every time you edit the configuration file, all tasks will be automatically stopped. Therefore, please do not modify the configuration file randomly during the upload process.

## Issue Feedback

This project is developed in spare time. You can report issues here, but the fixes may not be immediate.

[Submit an Issue](https://github.com/oorzc/vscode_sync_tool/issues)
