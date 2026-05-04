import fs from "fs-extra"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { l10n } from "vscode"
import { FileTransferConfigItem, opType } from './types/config';
import { CACHE_DIRNAME, URI_SCHEME, CONFIG_FILENAME } from './config/config';
import { addConfig, getUserConfig, toArray, isIgnore, getRootPath, getIgnoreConfig, debounce, getPluginSetting, sleep, showInformationMessage, deepClone, getConfigFilePath, ensureConfigDir, clearConfigCache } from "./utils"
import { uploadOnSave } from "./events/uploadOnSave"
import { myEvent } from "./events/myEvent"
import { DepNodeProvider } from "./treeProvider"
import { getContext, setContext } from "./config/globals";
import FileTransfer from "./FileTransfer";
import { MemFS } from "./FileProvider";
import { cleanLogTask, outputChannel } from "./output";
import { StatusBarUi } from "./statusBar";
import { Mutex } from 'async-mutex';
import { CodeLensProvider, handleEncryptionOrDecryption } from "./CodeLensProvider"
import type { SyncEvent } from "./events/myEvent"
import isDirectory from "is-directory"

let treeProvider: DepNodeProvider
let TreeView: vscode.TreeView<vscode.TreeItem>

// 防止重命名时，会触发创建文件监听
let renamingFiles: Set<string> = new Set();
// 防止保存时，会触发保存文件监听
let saveFiles: Set<string> = new Set();

// TODO 添加拖拽上传是否需要确认功能，添加ssh右键解压功能，有同步任务时需要刷新同步状态
// TODO watch上传后未清空缓存，需要添加清空缓存功能
// TODO 释放git操作exec
// TODO 检查忽略文件提交
// TODO 下载忽略文件测试
// TODO ssh压缩解压
// TODO 翻译多国语言

// 激活事件
export async function activate(context: vscode.ExtensionContext) {
	// 在扩展启动时，将 context 设置为全局变量
	setContext(context)

	clearConfigCache()
	vscode.commands.executeCommand("setContext", "canEdit", false);

	const provider = new MemFS();
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider(URI_SCHEME, provider, { isCaseSensitive: true }));

	let rootPath = getRootPath()

	// 配置文件迁移：当用户设置了外部存储路径时，自动迁移旧配置
	if (rootPath) {
		const configStorePath = getPluginSetting().get<string>("configStorePath") || "";
		if (configStorePath) {
			const oldPath = path.join(rootPath, CONFIG_FILENAME);
			const newPath = getConfigFilePath(rootPath);
			if (oldPath !== newPath && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
				const migrate = l10n.t('Migrate');
				const keep = l10n.t('Keep in project root');
				const answer = await vscode.window.showInformationMessage(
					l10n.t('Detected config file in project root. Migrate to the configured external directory?'),
					migrate,
					keep
				);
				if (answer === migrate) {
					ensureConfigDir(newPath);
					fs.moveSync(oldPath, newPath);
					vscode.window.showInformationMessage(
						l10n.t('Config file migrated to: {0}', newPath)
					);
				}
			}
		}
	}

	treeProvider = new DepNodeProvider()

	let mutex = new Mutex();


	// 注册树视图
	TreeView = vscode.window.createTreeView("asyncToolsView", {
		canSelectMany: true,
		showCollapseAll: false,
		treeDataProvider: treeProvider,
		dragAndDropController: treeProvider
	})
	context.subscriptions.push(TreeView)
	// context.subscriptions.push(treeProvider);

	// 监听自定义事件触发
	myEvent.event(async (eventType: SyncEvent) => {
		if (eventType === 'update') {
			debouncedUpdateViewCount()
		}
		if (eventType === 'updateMenu') {
			debouncedRefreshMenu()
		}
		if (typeof eventType === 'object') {
			if (eventType.type === 'refreshNode') {
				const release = await mutex.acquire();
				try {
					await treeProvider.uploadComplete(eventType.task)
				} finally {
					release();
				}
			}
			if (eventType.type === 'refreshSyncStatus') {
				treeProvider.updateSyncStatus(eventType.name, eventType.status)
			}
		}
	})
	// 初始化数字显示
	myEvent.fire("update")

	// 添加配置
	let handleAddConfig = vscode.commands.registerCommand(
		"sync_tools.addConfig",
		async () => {
			await addConfig(
				rootPath
			)
			myEvent.fire("update")
		}
	)
	context.subscriptions.push(handleAddConfig)

	const workspaceState = context.workspaceState;
	clearConfigCache()

	// 注册清除所有缓存的命令
	vscode.commands.registerCommand("sync_tools.clearAllCache", () => clearAllCache(workspaceState))
	// 注册关闭所有连接命令
	vscode.commands.registerCommand("sync_tools.closeAllClient", async () => {
		myEvent.fire("updateMenu")
		FileTransfer.closeAll()
	})
	//清除日志记录
	vscode.commands.registerCommand('sync_tools.clearAllLog', () => {
		cleanLogTask(true)
	});
	// 显示日志输出
	vscode.commands.registerCommand('sync_tools.outputShow', () => {
		treeProvider.getAllNodes()
		outputChannel.show(true)
	});

	// 右键上传文件
	vscode.commands.registerCommand('sync_tools.uploadFilesByExplorer', async (source) => {
		const item = await getDefaultConfig();
		if (item) {
			await uploadFileTask(item, source.fsPath);
		}
	});

	// 右键对比远程文件
	vscode.commands.registerCommand('sync_tools.compareFileByExplorer', async (source) => {
		const item = await getDefaultConfig();
		if (item) {
			await compareFileTask(item, source.fsPath);
		}
	});

	//打开项目设置
	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.editConfig', async () => {
			let configPath = getConfigFilePath(rootPath)
			if (!fs.existsSync(configPath)) return

			const uri = vscode.Uri.file(configPath);
			const document = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(document, {
				preview: false,
				viewColumn: vscode.ViewColumn.Active,
			});
		})
	);

	//打开插件设置
	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.openPluginSetting', () => {
			vscode.commands.executeCommand('workbench.action.openSettings', '@ext:oorzc.ssh-tools');
		})
	);

	// 选择配置文件外部存储目录
	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.selectConfigStorePath', async () => {
			const current = getPluginSetting().get<string>("configStorePath") || "";
			const uris = await vscode.window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: l10n.t('Select config store directory'),
				defaultUri: current ? vscode.Uri.file(current) : undefined,
			});
			if (!uris || !uris.length) return;
			const selectedPath = uris[0].fsPath;
			await getPluginSetting().update("configStorePath", selectedPath, vscode.ConfigurationTarget.Global);

			const curRoot = getRootPath();
			if (curRoot) {
				const oldPath = path.join(curRoot, CONFIG_FILENAME);
				const newPath = getConfigFilePath(curRoot);
				if (oldPath !== newPath && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
					const migrate = l10n.t('Migrate');
					const keep = l10n.t('Keep in project root');
					const answer = await vscode.window.showInformationMessage(
						l10n.t('Detected config file in project root. Migrate to the configured external directory?'),
						migrate,
						keep
					);
					if (answer === migrate) {
						ensureConfigDir(newPath);
						fs.moveSync(oldPath, newPath);
						vscode.window.showInformationMessage(l10n.t('Config file migrated to: {0}', newPath));
					}
				}
				clearConfigCache(curRoot);
				await getUserConfig(2, 2, curRoot);
				await FileTransfer.closeAll();
				myEvent.fire("updateMenu");
			}
		})
	);

	// 清除配置文件外部存储路径（恢复到项目根目录）
	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.resetConfigStorePath', async () => {
			const current = getPluginSetting().get<string>("configStorePath") || "";
			if (!current) {
				vscode.window.showInformationMessage(l10n.t('Config store path is already using project root'));
				return;
			}
			const curRoot = getRootPath();
			if (curRoot) {
				const externalPath = getConfigFilePath(curRoot);
				await getPluginSetting().update("configStorePath", "", vscode.ConfigurationTarget.Global);
				const localPath = path.join(curRoot, CONFIG_FILENAME);
				if (fs.existsSync(externalPath) && !fs.existsSync(localPath)) {
					const migrate = l10n.t('Migrate');
					const keep = l10n.t('Keep in external directory');
					const answer = await vscode.window.showInformationMessage(
						l10n.t('Migrate config file back to project root?'),
						migrate,
						keep
					);
					if (answer === migrate) {
						fs.moveSync(externalPath, localPath);
						vscode.window.showInformationMessage(l10n.t('Config file migrated to: {0}', localPath));
					}
				}
				clearConfigCache(curRoot);
				await getUserConfig(2, 2, curRoot);
				await FileTransfer.closeAll();
				myEvent.fire("updateMenu");
			}
		})
	);


	//代码透镜，在指定文字上方添加操作
	CodeLensProvider(context)


	// 注册文件变动监听
	initFileEvents(context)
}


// 获取默认配置
async function getDefaultConfig() {
	const config = await getUserConfig(2);
	if (!config) return null;

	const defaultConfig = toArray(config).filter(v => v.default);
	if (defaultConfig.length === 0) {
		vscode.window.showErrorMessage(l10n.t("Please set the default configuration first: {default: true}"));
		return null;
	} else if (defaultConfig.length > 1) {
		vscode.window.showErrorMessage(l10n.t('Default configuration {default: true} cannot exceed 1'));
		return null;
	}
	return defaultConfig[0];
}

// 生成远程路径
function generateRemotePath(item: FileTransferConfigItem, sourcePath: string) {
	let rootPath = item.workspaceRoot || getRootPath()
	return path.posix.join(item.type !== "ftp" ? item.remotePath : "/", path.relative(rootPath, sourcePath));
}

// 上传文件任务
async function uploadFileTask(item: FileTransferConfigItem, sourcePath: string) {
	const remotePath = generateRemotePath(item, sourcePath);
	new FileTransfer(item);
	await FileTransfer.addTask({
		config: item,
		localPath: sourcePath,
		remotePath,
		isDirectory: isDirectory.sync(sourcePath),
		operationType: 'upload'
	});
}

// 比对文件任务
async function compareFileTask(item: FileTransferConfigItem, sourcePath: string) {
	const remotePath = generateRemotePath(item, sourcePath);
	const localPath = path.join(os.tmpdir(), CACHE_DIRNAME, item.name, remotePath);
	new FileTransfer(item);
	await FileTransfer.addTask({
		config: item,
		localPath,
		remotePath,
		compare: true,
		isDirectory: isDirectory.sync(sourcePath),
		operationType: 'download'
	});
}

// 注册文件创建监听器（支持多工作区）
function initFileEvents(context: vscode.ExtensionContext): void {
	const folders = vscode.workspace.workspaceFolders
	if (!folders?.length) return

	// 为每个工作区文件夹创建独立的文件系统观察者
	for (const folder of folders) {
		const folderRoot = folder.uri.fsPath;
		const directoryToWatch = vscode.Uri.file(folderRoot);
		const fileWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(directoryToWatch, '**/*')
		);

		context.subscriptions.push(
			fileWatcher.onDidCreate(async (uri) => {
				console.log(`创建了：${uri.fsPath}`)
				if (renamingFiles.has(uri.fsPath)) return;
				if (FileTransfer.noUploadFiles.has(uri.fsPath)) return;
				let opType = {
					op: "add",
					type: "file"
				}
				if (isDirectory.sync(uri.fsPath)) {
					opType.type = "directory"
				}
				saveChangeFile(context, uri.fsPath, opType)
			})
		)

		fileWatcher.onDidChange((uri) => {
			console.log(`修改了：${uri.fsPath}`)
			if (saveFiles.has(uri.fsPath)) return;
			if (fs.lstatSync(uri.fsPath).isDirectory()) {
				saveChangeFile(context, uri.fsPath, { op: "add", type: "directory" })
			} else {
				saveChangeFile(context, uri.fsPath, { op: "add", type: "file" })
			}
		});
	}

	// 修改文件监听器（全局事件，无需按文件夹区分）
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			debounceSave(document)
		})
	)

	// 注册文件删除前的事件
	context.subscriptions.push(
		vscode.workspace.onWillDeleteFiles(async (e) => {
			for (const v of e.files) {
				console.log(`删除了：${v.fsPath}`)
				let fileRoot = getRootPath(v.fsPath)
				if (!fileRoot) continue
				if (fs.lstatSync(v.fsPath).isDirectory()) {
					saveChangeFile(context, v.fsPath, { op: "delete", type: "directory" })
				} else {
					saveChangeFile(context, v.fsPath, { op: "delete", type: "file" })
				}
			}
		})
	)

	// 重命名监听器
	context.subscriptions.push(
		vscode.workspace.onWillRenameFiles((event) => {
			const { files } = event
			for (const v of files) {
				console.log(`重命名了：${v.oldUri} 为 ${v.newUri}`)
				let fileRoot = getRootPath(v.oldUri.fsPath)
				if (!fileRoot) continue

				renamingFiles.add(v.newUri.fsPath);
				setTimeout(() => {
					renamingFiles.delete(v.newUri.fsPath)
				}, 10000);

				let opType = {
					op: "rename",
					type: "file",
					newname: v.newUri.fsPath
				}
				if (isDirectory.sync(v.oldUri.fsPath)) {
					opType.type = "directory"
				}
				saveChangeFile(context, v.oldUri.fsPath, opType)
			}
		})
	)
}

// 清除所有缓存
async function clearAllCache(workspaceState: vscode.Memento) {
	vscode.window.showInformationMessage(l10n.t('Are you sure you want to clear all watch caches?'), l10n.t('Confirm'), l10n.t('Cancel')).then(async selection => {
		if (selection === l10n.t('Confirm')) {
			// 获取所有key
			let keys = workspaceState.keys();
			// 清空所有缓存
			for (const v of keys) {
				await workspaceState.update(v, '');
			}
			myEvent.fire("update")
		}
	});
}


// 将变化文件加入缓存
async function saveChangeFile(
	context: vscode.ExtensionContext,
	file: string,
	opType: opType
) {
	// 去掉一些其他文件
	if (!fs.existsSync(file)) {
		return
	}

	// 获取 workspaceState 对象
	const workspaceState = context.workspaceState

	let rootPath = getRootPath(file)
	// 仅处理项目内文件
	if (!rootPath || !path.normalize(file).startsWith(rootPath + path.sep)) {
		return
	}
	if (rootPath) {
		const currentConfigPath = getConfigFilePath(rootPath);
		if (file === currentConfigPath || (opType.newname && opType.newname === currentConfigPath)) {
			clearConfigCache(rootPath)
			await workspaceState.update("excludePath", "")
			setTimeout(async () => {
				await getUserConfig(2, 2, rootPath)
				await FileTransfer.closeAll()
				myEvent.fire("updateMenu")
			}, 100);
			return
		}

		let config = await getUserConfig(2, 2, rootPath)
		if (config) {
			let list = toArray(config, rootPath)
			list.forEach(async (item, index) => {
				if (path.basename(file) == ".gitignore") {
					//清空忽略文件配置缓存
					await workspaceState.update("excludePath", "")
					//清空ignore_config缓存
					await workspaceState.update("ignore_config_" + item.name, "")
				}
				let ignore_arr = await getIgnoreConfig(item, file)
				// 判断是否直传代码
				if (item.upload_on_save) {
					// 检测是否排除
					let res = await isIgnore(ignore_arr, file)
					if (!res) {
						uploadOnSave(item, file, opType)
					}
					return
				}

				// 判断是否监听项目
				if (!item.watch) return

				// 检测是否排除
				let res = await isIgnore(ignore_arr, file)
				if (!res) {
					let cache_key = item.name + "###" + rootPath
					// 从 workspaceState 中读取数据
					let globalData = workspaceState.get(cache_key)
					let data: Record<string, opType> = {}

					if (typeof globalData === "object" && globalData !== null) {
						data = globalData as Record<string, opType>
						// 防止对同一个文件重复操作
						let newOpType = deepClone(opType);
						if (data[file] && data[file].type == newOpType.type) {
							if (data[file].op == 'add' && newOpType.op == 'delete') {
								delete data[file]
							} else if (data[file] && data[file].op == 'delete' && newOpType.op == 'add') {
								delete data[file]
							} else if (data[file] && data[file].op == 'add' && newOpType.op == 'rename' && newOpType.newname) {
								newOpType.op = 'add'
								data[newOpType.newname] = newOpType
								delete data[file]
							} else if (data[file] && data[file].op == 'edit' && newOpType.op == 'rename' && newOpType.newname) {
								newOpType.op = 'add'
								data[newOpType.newname] = newOpType
								data[file].op = 'delete'
							} else {
								data[file] = opType
							}
						} else {
							let flag = false
							for (const [k, v] of Object.entries(data)) {
								if ((newOpType.op == 'rename' || newOpType.op == 'delete') && v.newname && v.newname == file) {
									flag = true
									data[k] = newOpType
								}
							}
							if (!flag) {
								data[file] = opType
							}
						}
					} else {
						data[file] = opType
					}
					// 向 workspaceState 中写入数据
					await workspaceState.update(cache_key, data)
				}
			})
			myEvent.fire("update")
		}
	}
}


// 防抖设置
let debounceSave = debounce(async (document) => {
	let rootPath = getRootPath()
	let context = getContext()
	console.log(`保存了文件`, document)

	// 记录将要被重命名的文件或文件夹
	saveFiles.add(document.uri.fsPath);
	setTimeout(() => {
		saveFiles.delete(document.uri.fsPath)
	}, 10000);

	if (document.uri.scheme === URI_SCHEME) {
		const segments = document.uri.path.replace(/^\//, '').split('/')
		if (segments.length < 3) return
		const configName = segments[0]
		const relPath = segments.slice(2).join('/')
		const remotePath = '/' + relPath
		const filePath = path.join(os.tmpdir(), CACHE_DIRNAME, configName, relPath)
		await treeProvider.saveFile(configName, document.getText(), filePath, remotePath)
		return
	}

	// 仅处理项目内文件，防止外部文件（如用户级 settings.json）被上传
	const fileRoot = getRootPath(document.fileName)
	if (!fileRoot || !path.normalize(document.fileName).startsWith(fileRoot + path.sep)) {
		return
	}

	// 执行你的操作
	let opType = {
		op: "edit",
		type: "file"
	}
	saveChangeFile(context, document.fileName, opType)
}, 800, true)

let debouncedUpdateViewCount = debounce(() => {
	treeProvider.refreshCount()
	let count = treeProvider.getCount()
	if (count) {
		TreeView.badge = { tooltip: count + l10n.t('Tasks pending upload'), value: treeProvider.getCount() }
	} else {
		TreeView.badge = { tooltip: '', value: 0 }
	}
}, 1000, false);

let debouncedRefreshMenu = debounce(() => {
	treeProvider.refresh()
}, 2000);

// 销毁周期
export async function deactivate() {
	StatusBarUi.dispose()
	FileTransfer.closeAll()
}