import fs from "fs-extra"
import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"
import { l10n } from "vscode"
import { FileTransferConfigItem, opType, Task } from './types/config';
import { CACHE_DIRNAME, CONFIG_FILENAME, URI_SCHEME } from './config/config';
import { addConfig, getUserConfig, toArray, getRootPath, getIgnoreConfig, debounce, generateRandomPassword, getPluginSetting, sleep, showInformationMessage, posixRelative, oConsole, getWorkspaceRoots, getWorkspaceStateKey, getConfigScopeKey, getConfigCacheDirectoryName, resolveWatchChangeForIgnore, copyConfigFilesTransactionally, getConfigFilePath, getPreferredConfigFilePath } from "./utils"
import { uploadOnSave } from "./events/uploadOnSave"
import { myEvent } from "./events/myEvent"
import { DepNodeProvider } from "./treeProvider"
import { getContext, setContext } from "./config/globals";
import FileTransfer from "./FileTransfer";
import { MemFS } from "./FileProvider";
import { cleanLogTask, outputChannel, updateProgress } from "./output";
import { StatusBarUi } from "./statusBar";
import { CodeLensProvider, handleEncryptionOrDecryption } from "./CodeLensProvider"
import { clearWatchCache, flushAllWatchCacheUpdates, queueWatchCacheUpdate } from "./watchCache"

const isDirectory = require("is-directory")

let treeProvider: DepNodeProvider
let TreeView: vscode.TreeView<vscode.TreeItem>

// 防止重命名资料夹时，子檔案的 create/change/delete 事件被误判为新增
// 存储的是「资料夹路径 + path.sep」前缀，用 startsWith 匹配子路径
let renamingFolderPrefixes: Set<string> = new Set();
// 防止重命名时，会触发创建文件监听（精确匹配，用于单档重命名）
let renamingFiles: Set<string> = new Set();
// 防止保存时，会触发保存文件监听
let saveFiles: Set<string> = new Set();
// upload_on_save 延迟上传计时器（同一配置+同一路径只保留最后一次触发）
const uploadOnSaveTimers: Map<string, NodeJS.Timeout> = new Map();

function sameFilePath(first: string, second: string): boolean {
	const normalize = (value: string) => process.platform === "win32"
		? path.resolve(value).toLowerCase()
		: path.resolve(value)
	return normalize(first) === normalize(second)
}

async function relocateConfigFiles(
	context: vscode.ExtensionContext,
	storePath: string,
	updateSetting: boolean
): Promise<boolean> {
	const relocations = getWorkspaceRoots()
		.map(rootPath => ({
			rootPath,
			sourcePath: getConfigFilePath(rootPath),
			targetPath: getPreferredConfigFilePath(rootPath, storePath)
		}))
		.filter(item => !sameFilePath(item.sourcePath, item.targetPath) && fs.existsSync(item.sourcePath));

	for (const { targetPath } of relocations) {
		if (fs.existsSync(targetPath)) {
			await vscode.window.showErrorMessage(l10n.t('A configuration file already exists at {0}.', targetPath));
			return false;
		}
	}

	if (relocations.length > 0) {
		const confirm = l10n.t('Confirm');
		const selection = await vscode.window.showInformationMessage(
			l10n.t('Move {0} configuration file(s) to the selected location?', relocations.length),
			confirm,
			l10n.t('Cancel')
		);
		if (selection !== confirm) return false;
	}

	try {
		await copyConfigFilesTransactionally(relocations, async () => {
			if (updateSetting) {
				await getPluginSetting().update('configStorePath', storePath, vscode.ConfigurationTarget.Global);
			}
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		oConsole.error(`[config:migrate][error] ${detail}`);
		await vscode.window.showErrorMessage(l10n.t('Could not move configuration file(s): {0}', detail));
		return false;
	}

	for (const { rootPath, sourcePath } of relocations) {
		try {
			await fs.remove(sourcePath);
		} catch (error) {
			oConsole.error(`[config:migrate][cleanup][error] ${sourcePath}: ${error}`);
		}
		await context.workspaceState.update(getWorkspaceStateKey('sync_config', rootPath), '');
	}
	return true;
}

async function reloadWorkspaceConfigs(context: vscode.ExtensionContext): Promise<void> {
	await FileTransfer.closeAll();
	for (const rootPath of getWorkspaceRoots()) {
		await context.workspaceState.update(getWorkspaceStateKey('sync_config', rootPath), '');
		await getUserConfig(2, 2, rootPath);
	}
	myEvent.fire('updateMenu');
}

// TODO 添加ssh右键解压功能，有同步任务时需要刷新同步状态
// TODO 释放git操作exec
// TODO 检查忽略文件提交
// TODO ssh压缩解压
// TODO 翻译多国语言

// 激活事件
export async function activate(context: vscode.ExtensionContext) {
	// 在扩展启动时，将 context 设置为全局变量
	setContext(context)

	for (const workspaceRoot of getWorkspaceRoots()) {
		await context.workspaceState.update(getWorkspaceStateKey("sync_config", workspaceRoot), "")
	}
	const configuredStorePath = getPluginSetting().get<string>('configStorePath', '').trim();
	if (configuredStorePath && path.isAbsolute(configuredStorePath)) {
		await relocateConfigFiles(context, configuredStorePath, false);
	}
	vscode.commands.executeCommand("setContext", "canEdit", false);

	const provider = new MemFS();
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider(URI_SCHEME, provider, { isCaseSensitive: true }));

	treeProvider = new DepNodeProvider()

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
	myEvent.event(async (eventType) => {
		if (eventType === 'update') {
			debouncedUpdateViewCount()
		}
		if (eventType === 'updateMenu') {
			debouncedRefreshMenu()
		}
		if (typeof eventType === 'object' && eventType !== null) {
			if (eventType.type === 'refreshNode') {
				treeProvider.queueUploadComplete(eventType.task)
			}
			if (eventType.type === 'refreshSyncStatus') {
				if (eventType.workspaceRoot) {
					if (eventType.status === 'complete_sync') {
						await treeProvider.flushUploadComplete(getConfigScopeKey({
							name: eventType.name,
							workspaceRoot: eventType.workspaceRoot
						}))
					}
					await treeProvider.updateSyncStatus(eventType.name, eventType.status, eventType.workspaceRoot)
				}
			}
		}
	})
	// 初始化数字显示
	myEvent.fire("update")

	// 添加配置
	let handleAddConfig = vscode.commands.registerCommand(
		"sync_tools.addConfig",
		async () => {
			const rootPath = await getCommandWorkspaceRoot()
			if (!rootPath) return
			await addConfig(rootPath)
			myEvent.fire("updateMenu")
		}
	)
	context.subscriptions.push(handleAddConfig)

	// 获取 workspaceState 对象
	const workspaceState = context.workspaceState;

	// 注册清除所有缓存的命令
	vscode.commands.registerCommand("sync_tools.clearAllCache", () => clearAllCache(workspaceState))
	// 注册关闭所有连接命令
	vscode.commands.registerCommand("sync_tools.closeAllClient", async () => {
		myEvent.fire("updateMenu")
		await FileTransfer.closeAll()
	})
	//清除日志记录
	vscode.commands.registerCommand('sync_tools.clearAllLog', () => {
		cleanLogTask(true)
	});
	// 显示日志输出
	vscode.commands.registerCommand('sync_tools.outputShow', () => {
		treeProvider.getAllNodes()
		updateProgress(true)
		outputChannel.show(true)
	});

	// 右键上传文件
	vscode.commands.registerCommand('sync_tools.uploadFilesByExplorer', async (source) => {
		const item = await getDefaultConfig(source.fsPath);
		if (item) {
			await uploadFileTask(item, source.fsPath);
		}
	});

	// 右键对比远程文件
	vscode.commands.registerCommand('sync_tools.compareFileByExplorer', async (source) => {
		const item = await getDefaultConfig(source.fsPath);
		if (item) {
			await compareFileTask(item, source.fsPath);
		}
	});

	//打开项目设置
	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.editConfig', async () => {
			const rootPath = await getCommandWorkspaceRoot()
			if (!rootPath) return
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

	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.selectConfigStorePath', async () => {
			const current = getPluginSetting().get<string>('configStorePath', '');
			const selected = await vscode.window.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: l10n.t('Select config store directory'),
				defaultUri: current && path.isAbsolute(current) ? vscode.Uri.file(current) : undefined
			});
			if (!selected?.length) return;

			const selectedPath = selected[0].fsPath;
			const invalidForWorkspace = getWorkspaceRoots().some(rootPath =>
				sameFilePath(getPreferredConfigFilePath(rootPath, selectedPath), path.join(rootPath, CONFIG_FILENAME))
			);
			if (!path.isAbsolute(selectedPath) || invalidForWorkspace) {
				await vscode.window.showErrorMessage(l10n.t('The config store directory must be an absolute path outside every workspace.'));
				return;
			}

			if (await relocateConfigFiles(context, selectedPath, true)) {
				await reloadWorkspaceConfigs(context);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('sync_tools.resetConfigStorePath', async () => {
			const current = getPluginSetting().get<string>('configStorePath', '').trim();
			if (!current) {
				await vscode.window.showInformationMessage(l10n.t('Config store path already uses the project root.'));
				return;
			}
			if (await relocateConfigFiles(context, '', true)) {
				await reloadWorkspaceConfigs(context);
			}
		})
	);


	//代码透镜，在指定文字上方添加操作
	CodeLensProvider(context)


	// 注册文件变动监听
	initFileEvents(context)
}


async function getCommandWorkspaceRoot() {
	const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
	const activeRoot = activeFile ? getRootPath(activeFile) : "";
	if (activeRoot) return activeRoot;
	const roots = getWorkspaceRoots();
	if (roots.length === 1) return roots[0];
	const selected = await vscode.window.showWorkspaceFolderPick();
	return selected?.uri.fsPath || "";
}

// 获取默认配置
async function getDefaultConfig(sourcePath: string) {
	const rootPath = getRootPath(sourcePath);
	if (!rootPath) return null;
	const config = await getUserConfig(2, 1, rootPath);
	if (!config) return null;

	const defaultConfig = toArray(config, rootPath).filter(v => v.default);
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
	const rootPath = item.workspaceRoot || getRootPath(sourcePath)
	if (!rootPath) throw new Error(l10n.t('File is outside the workspace: {0}', sourcePath))
	return path.posix.join(item.type !== "ftp" ? item.remotePath : "/", posixRelative(rootPath, sourcePath));
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
	const localPath = path.join(os.tmpdir(), CACHE_DIRNAME, getConfigCacheDirectoryName(item), remotePath);
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

/**
 * 判断给定路径是否属于「正在重命名中的资料夹」的子路径。
 * 用于过滤 onDidCreate / onDidChange 中因资料夹重命名而连带触发的子档案事件。
 */
function isInRenamingFolder(fsPath: string): boolean {
	for (const prefix of renamingFolderPrefixes) {
		if (fsPath === prefix || fsPath.startsWith(prefix)) {
			return true;
		}
	}
	return false;
}

// 注册文件创建监听器
function initFileEvents(context: vscode.ExtensionContext): void {
	if (!getWorkspaceRoots().length) return

	// 單一 watcher 涵蓋所有 workspace folders；事件再以 getWorkspaceFolder 精確歸屬。
	const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

	// 创建文件系统观察者
	// const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
	context.subscriptions.push(
		fileWatcher.onDidCreate(async (uri) => {
			if (renamingFiles.has(uri.fsPath)) {
				return;
			}

			// 过滤资料夹重命名产生的子档案 create 事件
			if (isInRenamingFolder(uri.fsPath)) {
				return;
			}

			if (FileTransfer.noUploadFiles.has(uri.fsPath)) {
				return
			}

			if (!getRootPath(uri.fsPath)) return
			const opType: opType = {
				op: "add",
				type: isDirectory.sync(uri.fsPath) ? "directory" : "file"
			}
			saveChangeFile(context, uri.fsPath, opType)
		})
	)

	fileWatcher.onDidChange((uri) => {
		if (saveFiles.has(uri.fsPath)) {
			return;
		}

		// 过滤资料夹重命名产生的子档案 change 事件
		if (isInRenamingFolder(uri.fsPath)) {
			return;
		}

		if (!getRootPath(uri.fsPath)) return
		let isDirectoryPath: boolean;
		try {
			isDirectoryPath = fs.lstatSync(uri.fsPath).isDirectory();
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		if (isDirectoryPath) {
			const opType: opType = {
				op: "add",
				type: "directory"
			}
			saveChangeFile(context, uri.fsPath, opType)
		} else {
			const opType: opType = {
				op: "add",
				type: "file"
			}
			saveChangeFile(context, uri.fsPath, opType)
		}
	});
	// fileWatcher.onDidDelete((uri) => { });

	// 注册添加文件的事件（已废弃，无法监听git拉取文件）
	// context.subscriptions.push(
	// 	vscode.workspace.onDidCreateFiles((event) => {
	// 		const { files } = event
	// 		files.forEach(async (file) => {
	// 			console.log(`创建了：${file.fsPath}`)
	// 			let opType = {
	// 				op: "add",
	// 				type: "file"
	// 			}
	// 			if (isDirectory.sync(file.fsPath)) {
	// 				opType.type = "directory"
	// 			}
	// 			await saveChangeFile(context, file.fsPath, opType)
	// 		})
	// 	})
	// )

	// 修改文件监听器
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((document) => {
			debounceSave(document)
		})
	)

	// 注册文件删除前的事件
	context.subscriptions.push(
		vscode.workspace.onWillDeleteFiles(async (e) => {
			for (const v of e.files) {
				if (!getRootPath(v.fsPath)) continue
				if (fs.lstatSync(v.fsPath).isDirectory()) {
					const opType: opType = {
						op: "delete",
						type: "directory"
					}
					saveChangeFile(context, v.fsPath, opType)
					// let files = await getAllFiles(v.fsPath)
					// for (const vv of files) {
					// 	let opType2 = {
					// 		op: "delete",
					// 		type: "file"
					// 	}
					// 	await saveChangeFile(context, vv, opType2)
					// }
				} else {
					const opType: opType = {
						op: "delete",
						type: "file"
					}
					saveChangeFile(context, v.fsPath, opType)
				}
			}
		})
	)

	// 重命名监听器
	context.subscriptions.push(
		// vscode.workspace.onDidRenameFiles((event) => {
		vscode.workspace.onWillRenameFiles((event) => {
			const { files } = event
			for (const v of files) {
				if (!getRootPath(v.oldUri.fsPath)) continue

				const isDir = isDirectory.sync(v.oldUri.fsPath);

				// 记录将要被重命名的文件或文件夹
				renamingFiles.add(v.newUri.fsPath);

				// 若为资料夹，额外记录新旧路径前缀，用于过滤子档案的 create/change 事件
				if (isDir) {
					const oldPrefix = v.oldUri.fsPath + path.sep;
					const newPrefix = v.newUri.fsPath + path.sep;
					renamingFolderPrefixes.add(oldPrefix);
					renamingFolderPrefixes.add(newPrefix);
					// 同时将新资料夹路径本身也加入（onDidCreate 会对资料夹本身也触发）
					renamingFolderPrefixes.add(v.newUri.fsPath);
				}

				setTimeout(() => {
					renamingFiles.delete(v.newUri.fsPath)
					if (isDir) {
						renamingFolderPrefixes.delete(v.oldUri.fsPath + path.sep);
						renamingFolderPrefixes.delete(v.newUri.fsPath + path.sep);
						renamingFolderPrefixes.delete(v.newUri.fsPath);
					}
				}, 10000);

				const opType: opType = {
					op: "rename",
					type: isDir ? "directory" : "file",
					newname: v.newUri.fsPath
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
			await flushAllWatchCacheUpdates()
			// 获取所有key
			let keys = workspaceState.keys();
			// 清空所有缓存
			for (const v of keys) {
				await clearWatchCache(workspaceState, v)
			}
			myEvent.fire("update")
		}
	});
}

function scheduleUploadOnSave(
	item: FileTransferConfigItem,
	file: string,
	opType: opType
) {
	const timerKey = `${getConfigScopeKey(item)}###${file}`
	const existingTimer = uploadOnSaveTimers.get(timerKey)
	if (existingTimer) {
		clearTimeout(existingTimer)
		uploadOnSaveTimers.delete(timerKey)
	}

	const delaySeconds = item.uploadDelay ?? 0
	if (delaySeconds <= 0) {
		uploadOnSave(item, file, opType)
		return
	}

	const latestOpType = { ...opType }
	const timer = setTimeout(() => {
		uploadOnSaveTimers.delete(timerKey)
		uploadOnSave(item, file, latestOpType)
	}, delaySeconds * 1000)

	uploadOnSaveTimers.set(timerKey, timer)
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
	if (rootPath) {
		// 如果是操作的根目录下面的配置文件
		const configPath = getConfigFilePath(rootPath)
		if (sameFilePath(file, configPath) || (opType.newname && sameFilePath(opType.newname, configPath))) {
			const previousConfig = await getUserConfig(2, 2, rootPath)
			// 清空此 workspace 的 config cache。
			await workspaceState.update(getWorkspaceStateKey("sync_config", rootPath), "")
			setTimeout(async () => {
				if (previousConfig) {
					for (const item of toArray(previousConfig, rootPath)) {
						await FileTransfer.closeAll(item)
					}
				}
				await getUserConfig(2, 2, rootPath)
				myEvent.fire("updateMenu")

			}, 100);
			return
		}

		let config = await getUserConfig(2, 2, rootPath)
		if (config) {
			let list = toArray(config, rootPath)
			for (const item of list) {
				if (path.basename(file) === ".gitignore") {
					// 清除此 workspace/config 的 .gitignore cache。
					await workspaceState.update(getWorkspaceStateKey("ignore_config", rootPath, item.name), "")
				}
				let ignore_arr = await getIgnoreConfig(item, file)
				const resolvedChange = await resolveWatchChangeForIgnore(ignore_arr, file, opType)
				if (!resolvedChange) continue
				// 判断是否直传代码
				if (item.upload_on_save) {
					// 检测是否排除
					scheduleUploadOnSave(item, resolvedChange.file, resolvedChange.opType)
					continue
				}
				// 判断是否监听项目
				if (!item.watch) continue

				// 检测是否排除
				let cache_key = item.name + "###" + rootPath
				await queueWatchCacheUpdate(
					workspaceState,
					cache_key,
					resolvedChange.file,
					resolvedChange.opType
				)
			}
			myEvent.fire("update")
		}
	}
}


// 防抖设置
let debounceSave = debounce(async (document) => {
	let rootPath = getRootPath(document.uri.fsPath)
	let context = getContext()
	const configRoot = getWorkspaceRoots().find(root => sameFilePath(getConfigFilePath(root), document.uri.fsPath));
	if (configRoot) {
		await context.workspaceState.update(getWorkspaceStateKey('sync_config', configRoot), '');
		await FileTransfer.closeAll();
		await getUserConfig(2, 2, configRoot);
		myEvent.fire('updateMenu');
		return;
	}
	// 记录将要被重命名的文件或文件夹
	saveFiles.add(document.uri.fsPath);
	setTimeout(() => {
		saveFiles.delete(document.uri.fsPath)
	}, 10000);

	if (!rootPath) {
		let pathArr = document.uri.fsPath.split(path.sep)
		if (pathArr.length < 3) return
		let configScope = decodeURIComponent(pathArr[1])
		let remotePath = pathArr.slice(3).join("/")
		let localPath = pathArr.slice(4).join("/")
		localPath = localPath ? localPath : remotePath
		let filePath = path.join(os.tmpdir(), CACHE_DIRNAME, pathArr[1], localPath)
		await treeProvider.saveFile(configScope, document.getText(), filePath, remotePath)
		return
	}

	// 执行你的操作
	const opType: opType = {
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
	await flushAllWatchCacheUpdates()
	await treeProvider?.flushUploadComplete()
	StatusBarUi.dispose()
	await FileTransfer.closeAll()
}
