import os from 'os';
import dayjs from 'dayjs';
import * as path from 'path';
import * as fs from "fs-extra";
import { Deploy } from './deploy';
import * as vscode from "vscode";
import FileTransfer from './FileTransfer';
import { myEvent } from "./events/myEvent"
import type { SyncStatus } from "./events/myEvent"
import { getContext } from './config/globals';
import { addLogTask, updateTaskProgress } from './output';
import { CACHE_DIRNAME, URI_SCHEME } from './config/config';
import { FileTransferConfigItem, Task } from './types/config';
import { l10n, TreeItem, ThemeIcon, TreeItemCollapsibleState, ProviderResult } from 'vscode';
import { toArray, getUserConfig, inputMsg, debounce, getUseTime, formatFileSize, getPluginSetting, showInformationMessage, splitPath, getParentPath, sortFiles, isValidLinuxPermission, permissionsToOctal, getNormalPath, oConsole, getWorkspaceRoots, getConfigScopeKey, getConfigCacheDirectoryName } from "./utils";
import { FileTransferClient, FTPRemoteFileInfo, isFTPClient, isSFTPClient, RemoteFileInfo, SFTPFileInfo } from "./types/client";
import { NoWatchFilesError } from './types/connect';
import { clearWatchCache } from './watchCache';

// 记录是否拖放
let isDragging = false
const TREE_REFRESH_DEBOUNCE_MS = 50

type PendingTreeRefresh = {
	tasks: Task[];
	timer: NodeJS.Timeout;
}

export class RepositoryFile {
	name: string = '';
	isDirectory: boolean = false;
	size: number = 0;
	permission?: string = ''; // 权限
}

class LoadingNode extends TreeItem {
	constructor() {
		super("Loading...", TreeItemCollapsibleState.None);
		const iconPath = path.join(__filename, '..', '..', 'static', 'loading.gif')
		this.iconPath = {
			light: vscode.Uri.file(iconPath),
			dark: vscode.Uri.file(iconPath)
		};
		this.contextValue = "loading";
	}
}

export class Dependency extends TreeItem {
	isRun: boolean = false;
	children: RepositoryFileNode[] = []; // 添加 children 属性
	parent: boolean;
	isLoading: boolean = true;
	realPath: string;
	constructor(
		public config: FileTransferConfigItem,
		public collapsibleState: vscode.TreeItemCollapsibleState, // 0 不能展开折叠，没有子项 ，1 折叠  ，2 展开
		public tooltip: string,
		public description: string,
		public index: number,
	) {
		super(config.name, collapsibleState);
		this.tooltip = this.tooltip;
		this.description = this.description;
		this.index = this.index;
		this.parent = false;
		this.realPath = path.posix.join(config.type == 'ftp' ? '/' : config.remotePath)

		const iconName = this.isRun ? "vm-active" : "vm-outline";
		this.iconPath = new ThemeIcon(iconName);
		this.contextValue = this.isRun ? "tools_connect" : "tools_disconnect";
	}
}


const deployInstances = new Map<string, Deploy>()

export class RepositoryFileNode extends TreeItem {
	realPath: string;
	config: FileTransferConfigItem;
	isLoading: boolean = true;
	children: RepositoryFileNode[] = []; // 添加 children 属性
	isNew: boolean;

	constructor(public file: RepositoryFile, public parent: Dependency | RepositoryFileNode, public parentPath: string) {
		super(
			file.name,
			file.isDirectory ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
		);
		let realPath = getNormalPath(path.posix.join(this.parentPath, file.name));
		this.resourceUri = vscode.Uri.parse(`${this.parentPath}/${this.file.name}`);
		this.tooltip = realPath + "  " + this.file.permission + (file.isDirectory ? "" : " " + formatFileSize(this.file.size));
		this.realPath = realPath;
		this.config = parent.config;
		this.parent = parent;
		this.isNew = false;
		this.contextValue = file.isDirectory ? "sync_folder" : "sync_file";
		if (this.config.type == 'ssh') {
			this.contextValue += "_ssh";
		}
		this.iconPath = file.isDirectory ? ThemeIcon.Folder : ThemeIcon.File;

		// 若不是拖放操作，则设置 command
		if (!isDragging && !file.isDirectory) {
			this.command = {
				command: 'sync_tools.openResource',
				arguments: [this],
				title: 'Open Resource'
			};
		}
	}

}



export class DepNodeProvider implements vscode.TreeDataProvider<TreeItem>, vscode.TreeDragAndDropController<Dependency | RepositoryFileNode> {
	dropMimeTypes = ['application/vnd.code.tree.asyncToolsView', 'text/uri-list'];
	dragMimeTypes = ['application/vnd.code.tree.asyncToolsView'];

	private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

	private count: number;
	private items: Dependency[];
	private context: vscode.ExtensionContext;
	private pendingTreeRefreshes = new Map<string, PendingTreeRefresh>();
	private allNodes = new Map<string, Dependency | RepositoryFileNode>();
	refreshTimer: string | number | NodeJS.Timeout | undefined;


	// rootPath 当前工作区根路径
	constructor() {
		this.count = 0
		this.items = []
		this.context = getContext();
		this.getMenu()
		isDragging = false

		// 注册树视图配置上传命令
		vscode.commands.registerCommand("sync_tools.uploadEntry", debounce((item: Dependency) => this.uploadEntry(item), 2000, true));
		//暂停同步
		vscode.commands.registerCommand("sync_tools.pauseSync", debounce((item: Dependency) => this.pauseSync(item), 1000, true));
		// 取消同步
		vscode.commands.registerCommand("sync_tools.stopSync", debounce((item: Dependency) => this.stopSync(item), 1000, true));
		// 恢复同步
		vscode.commands.registerCommand("sync_tools.restartSync", debounce((item: Dependency) => this.restartSync(item), 1000, true));

		// 注册树视图清除缓存的命令
		vscode.commands.registerCommand("sync_tools.clearCache", debounce((item: Dependency) => this.clearCache(item), 1000, true));
		// 注册树视图打开文件命令
		vscode.commands.registerCommand('sync_tools.openResource', debounce((resource: RepositoryFileNode) => this.openResource(resource), 500, true));
		// 注册连接命令
		vscode.commands.registerCommand('sync_tools.connect', debounce((item: Dependency) => this.connect(item), 800, true))
		// 注册断开命令
		vscode.commands.registerCommand('sync_tools.disconnect', debounce((item: Dependency) => this.disconnect(item), 800, true))

		// 注册新建文件命令
		vscode.commands.registerCommand('sync_tools.addFile', (resource: Dependency | RepositoryFileNode) => this.addFileOrFolder(resource, 1))
		// 注册新建文件夹命令
		vscode.commands.registerCommand('sync_tools.addFolder', (resource: Dependency | RepositoryFileNode) => this.addFileOrFolder(resource, 2))

		//上传
		vscode.commands.registerCommand('sync_tools.uploadFiles', (resource: Dependency | RepositoryFileNode) => this.uploadFiles(resource))
		// 下载
		vscode.commands.registerCommand('sync_tools.downloadFile', (resource: Dependency | RepositoryFileNode) => this.downloadFile(resource))
		// 对比文件
		vscode.commands.registerCommand('sync_tools.compareFile', (resource: RepositoryFileNode) => this.compareFile(resource))
		// 刷新
		vscode.commands.registerCommand('sync_tools.refreshEntry', (resource: RepositoryFileNode) => this.refreshEntry(resource, 'refresh'))

		// 注册重命名文件、文件夹命令
		vscode.commands.registerCommand('sync_tools.renameFile', (resource: RepositoryFileNode) => this.renameFile(resource))
		// 注册修改权限命令
		vscode.commands.registerCommand('sync_tools.chmodFile', (resource: RepositoryFileNode) => this.chmodFile(resource))
		// 注册删除文件、文件夹命令
		vscode.commands.registerCommand('sync_tools.deleteFile', (resource: RepositoryFileNode) => this.deleteFile(resource))
	}


	async handleDrop(target: Dependency | RepositoryFileNode | undefined, sources: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		isDragging = false
		if (!target) return
		const fileList = sources.get('text/uri-list');
		const transferItem = sources.get('application/vnd.code.tree.asyncToolsView');
		let files = fileList?.value.split('\r\n') || [];

		let syncConfig = getPluginSetting()
		const confirmMoveOrUpload = syncConfig.get<boolean>("confirmMoveOrUpload", true)

		let len = files.length;
		let showConfirm = false
		for (let index = 0; index < len; index++) {
			let item = files[index]
			const localPath = vscode.Uri.parse(item).fsPath// 转换为本地文件路径
			let exist = fs.pathExistsSync(localPath)
			if (localPath != path.sep && !transferItem && exist) {
				let remotePath = ''
				const isDirectory = fs.lstatSync(localPath).isDirectory()
				if (target instanceof Dependency || target.file.isDirectory) {
					remotePath = target.realPath
				} else {
					remotePath = path.dirname(target.realPath)
				}

				if (!showConfirm && confirmMoveOrUpload) {
					let msg = len > 1 ? l10n.t('multiple files or folders') : ""
					let res = await showInformationMessage(
						l10n.t(`Are you sure you want to upload {0} {1} to the {2} directory?`, localPath, msg, getNormalPath(remotePath)),
						l10n.t('Confirm'),
						l10n.t('Cancel')
					)

					showConfirm = true
					if (res != l10n.t('Confirm')) break
				}

				remotePath = path.join(remotePath, path.basename(localPath))

				new FileTransfer(target.config);
				await FileTransfer.addTask({
					config: target.config,
					localPath: localPath,
					remotePath,
					operationType: 'upload',
					isDirectory,
					view: true
				});

			}
		}

		if (!transferItem) {
			return;
		}
		const treeItems: TreeItem[] = transferItem.value;

		let len2 = treeItems.length;
		for (let index = 0; index < len2; index++) {
			let node = treeItems[index]
			if (!(node instanceof Dependency) && !(node instanceof RepositoryFileNode)) {
				break
			}
			if (node instanceof Dependency) {
				break
			}
			//说明不在同一个配置中移动
			if ((target instanceof Dependency || target instanceof RepositoryFileNode) && node.config.name !== target.config.name) {
				break
			}

			if (node instanceof RepositoryFileNode) {
				let { client, fileTransfer } = await this.getClient(node.config)
				if (!client) break

				let remotePath
				if (target instanceof Dependency || target.file.isDirectory) {
					remotePath = target.realPath
				} else {
					remotePath = path.dirname(target.realPath)
				}

				let newPath = path.join(remotePath, path.basename(node.realPath))
				newPath = getNormalPath(newPath)
				if (newPath === node.realPath) {
					continue
				}
				try {
					if (!showConfirm && confirmMoveOrUpload) {
						let msg = len2 > 1 ? l10n.t('multiple files or folders') : ""
						let res = await showInformationMessage(
							l10n.t(`Are you sure you want to move {0} {1} to the {2} directory?`, node.realPath, msg, getNormalPath(remotePath)),
							l10n.t('Confirm'),
							l10n.t('Cancel')
						)
						showConfirm = true
						if (res != l10n.t('Confirm')) break
					}

					await client.rename(node.realPath, newPath);
					await fileTransfer.releaseClient(client, node.config)
					await this.refreshEntry(node, 'rename')
					await this.refreshEntry(target, 'add')

					this.checkToClose(node);
					this.showLog(node.config, 'move', 'success', `${node.realPath} -> ${newPath}`)
				} catch (err) {
					await fileTransfer.releaseClient(client, node.config)
					let errMsg = `${node.realPath} -> ${newPath} ${err?.toString()}`
					this.showLog(node.config, 'move', 'error', errMsg)
					let msg = `[move][${node.config.name}][${node.config.type}][error]`;
					vscode.window.showErrorMessage(`${msg}：${errMsg}`)
				}
			}
		}
	}

	async handleDrag(source: (Dependency | RepositoryFileNode)[], treeDataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		isDragging = true
		//需要延迟执行isDragging才会生效
		setTimeout(() => {
			treeDataTransfer.set('application/vnd.code.tree.asyncToolsView', new vscode.DataTransferItem(source));
		}, 10);
	}

	dispose(): void {
		// nothing to dispose
	}


	async uploadEntry(item: Dependency) {
		await this.changeMenuStatus(item, 'sync')
	}
	async pauseSync(item: Dependency) {
		await this.changeMenuStatus(item, 'pause_sync')
	}
	async stopSync(item: Dependency) {
		await this.changeMenuStatus(item, 'stop_sync')
	}
	async restartSync(item: Dependency) {
		await this.changeMenuStatus(item, 'restart_sync')
	}

	queueUploadComplete(task: Task) {
		const scopeKey = getConfigScopeKey(task.config)
		const existing = this.pendingTreeRefreshes.get(scopeKey)
		if (existing) {
			existing.tasks.push(task)
			return
		}

		this.pendingTreeRefreshes.set(scopeKey, {
			tasks: [task],
			timer: setTimeout(() => {
				void this.flushUploadComplete(scopeKey).catch(() => undefined)
			}, TREE_REFRESH_DEBOUNCE_MS)
		})
	}

	async flushUploadComplete(scopeKey?: string) {
		const scopeKeys = scopeKey ? [scopeKey] : Array.from(this.pendingTreeRefreshes.keys())
		for (const key of scopeKeys) {
			const pending = this.pendingTreeRefreshes.get(key)
			if (!pending) continue
			clearTimeout(pending.timer)
			this.pendingTreeRefreshes.delete(key)

			const changedNodes = new Set<Dependency | RepositoryFileNode>()
			for (const task of pending.tasks) {
				await this.applyUploadComplete(task, changedNodes)
			}
			for (const node of changedNodes) {
				if (node.children.length > 1) {
					node.children = sortFiles(node.children, true)
				}
				this._onDidChangeTreeData.fire(node)
			}
		}
	}

	private cancelUploadComplete(scopeKey: string) {
		const pending = this.pendingTreeRefreshes.get(scopeKey)
		if (!pending) return
		clearTimeout(pending.timer)
		this.pendingTreeRefreshes.delete(scopeKey)
	}

	private async applyUploadComplete(task: Task, changedNodes: Set<Dependency | RepositoryFileNode>) {
		const scopeKey = getConfigScopeKey(task.config)
		switch (task.operationType) {
			case 'upload':
				let existObj = this.allNodes.get(scopeKey + "###" + task.remotePath)
				if (existObj && existObj instanceof RepositoryFileNode) {
					let filePath = path.join(os.tmpdir(), CACHE_DIRNAME, getConfigCacheDirectoryName(task.config), task.config.type === 'ftp' ? existObj.realPath : path.relative(task.config.remotePath, existObj.realPath))
					this.checkToClose(existObj, false);
					await fs.promises.rm(filePath, { force: true }).catch(() => undefined)
				} else {
					let newPaths = splitPath(task.remotePath)
					let obj = this.findExistingPath(newPaths, task, false)
					if (obj) changedNodes.add(obj)
				}
				break;
			case 'delete':
				let deleteObj = this.allNodes.get(scopeKey + "###" + task.remotePath)
				if (deleteObj && deleteObj instanceof RepositoryFileNode) {
					const parent = deleteObj.parent
					parent.children = parent.children.filter(v => v.realPath !== task.remotePath)
					this.checkToClose(deleteObj);
					changedNodes.add(parent)
				}
				break;
			case 'rename':
				let remotePath = task.remotePath
				let localPath = task.localPath
				let realRenameFPath = path.posix.join('/', path.dirname(remotePath), path.basename(localPath))
				let renameObj = this.allNodes.get(scopeKey + "###" + realRenameFPath)
				if (renameObj && renameObj instanceof RepositoryFileNode) {
					let file: RepositoryFile =
					{
						name: path.basename(remotePath),
						isDirectory: renameObj.file.isDirectory,
						size: renameObj.file.size
					}
					let obj = renameObj.parent
					for (const [i, v] of obj.children.entries()) {
						if (v.realPath === realRenameFPath) {
							let newObj = new RepositoryFileNode(file, v.parent, v.parent.realPath)
							this.addNode(newObj);
							obj.children[i] = newObj
						}
					}
					this.checkToClose(renameObj);
					changedNodes.add(obj)
				}
				break;
			default:
				break;
		}

	}

	findExistingPath(a2: string[], task: Task, sortChildren: boolean = true) {
		let obj = null
		const scopeKey = getConfigScopeKey(task.config)
		for (let i = a2.length - 1; i >= 0; i--) { // 从后往前遍历a2
			let currentPath = a2[i];
			// 检查路径在 a1 中是否存在
			if (!this.allNodes.has(scopeKey + "###" + currentPath)) {
				// 获取上一级路径
				let parentPath = getParentPath(currentPath);
				// 如果上一级存在于a1中，则返回上一级路径
				const parentNode = this.allNodes.get(scopeKey + "###" + parentPath)
				if (parentNode) {
					obj = parentNode;
					if (obj instanceof Dependency && (!obj.isRun || obj.collapsibleState === TreeItemCollapsibleState.None)) {
						break
					}
					switch (task.operationType) {
						case 'upload':
							let isDirectory = i !== a2.length - 1 ? true : false
							if (task.isDirectory) {
								isDirectory = true
							}
							let file: RepositoryFile =
							{
								name: path.basename(currentPath),
								isDirectory: isDirectory ? true : false,
								size: isDirectory ? 0 : task.fileSize ? task.fileSize : 0
							}
							let exist = obj.children.filter(v => v.realPath == currentPath)
							if (!exist.length) {
								let newObj = new RepositoryFileNode(file, obj, parentPath)
								this.addNode(newObj);
								obj.children.push(newObj);
							}
							if (sortChildren) obj.children = sortFiles(obj.children, true)
							break;
						default:
							break;
					}
					break
				}
			}
		}
		return obj;
	}

	async updateSyncStatus(name: string, type: SyncStatus, workspaceRoot: string = "") {
		let obj = Array.from(this.items)
		let findOne = obj.find(v => getConfigScopeKey(v.config) === getConfigScopeKey({ name, workspaceRoot }))
		if (findOne) {
			if (type === 'start_sync' && findOne.contextValue !== 'tools_sync') {
				await this.changeMenuStatus(findOne, type)
			}
			if (type === 'complete_sync') {
				await this.changeMenuStatus(findOne, type)
			}
		}
	}

	async connect(item: Dependency) {
		await this.changeMenuStatus(item, 'connect')
	}

	async disconnect(item: Dependency) {
		await this.changeMenuStatus(item, 'disconnect')
	}

	// 获取父节点的方法
	getParent(element: TreeItem): TreeItem | undefined {
		return undefined;
	}

	async changeMenuStatus(item: Dependency, type: string) {
		let obj = Array.from(this.items)
		try {
			let iconPath = path.join(__filename, '..', '..', 'static', 'loading.gif')
			switch (type) {
				case 'connect':
					item.iconPath = iconPath
					item.contextValue = 'loading'
					this._onDidChangeTreeData.fire();
					this.items = obj
					let { client } = await this.getClient(item.config)
					await this.releaseClient(client, item.config)
					item.iconPath = new ThemeIcon("vm-active");
					item.contextValue = "tools_connect"
					item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
					item.isRun = true
					break;
				case 'disconnect':
					this.cancelUploadComplete(getConfigScopeKey(item.config))
					this.evictNodeSubtree(item)
					item.iconPath = new ThemeIcon("vm-outline");
					item.contextValue = "tools_disconnect"
					item.collapsibleState = vscode.TreeItemCollapsibleState.None
					item.children = []
					item.isLoading = true
					item.isRun = false
					await FileTransfer.closeAll(item.config)

					// 清除缓存节点
					break;
				case 'complete_sync':
					item.iconPath = item.isRun ? new ThemeIcon("vm-active") : new ThemeIcon("vm-outline");
					item.contextValue = item.isRun ? "tools_connect" : "tools_disconnect"
					break;
				case 'start_sync':
					item.iconPath = item.isRun ? new ThemeIcon("vm-active") : new ThemeIcon("vm-outline");
					item.iconPath = {
						dark: vscode.Uri.file(path.join(__filename, '..', '..', 'static', 'sync.svg')),
						light: vscode.Uri.file(path.join(__filename, '..', '..', 'static', 'sync_dark.svg'))
					};
					item.contextValue = "tools_sync"
					break;
				case 'sync':
					item.iconPath = item.isRun ? new ThemeIcon("vm-active") : new ThemeIcon("vm-outline");
					item.iconPath = {
						dark: vscode.Uri.file(path.join(__filename, '..', '..', 'static', 'sync.svg')),
						light: vscode.Uri.file(path.join(__filename, '..', '..', 'static', 'sync_dark.svg'))
					};
					item.contextValue = "tools_sync"
					this._onDidChangeTreeData.fire();
					this.items = obj
					// 执行上传
					const deployInstance = new Deploy(item)
					deployInstances.set(getConfigScopeKey(item.config), deployInstance)
					void deployInstance.start()
						.catch(() => undefined)
						.finally(() => deployInstances.delete(getConfigScopeKey(item.config)))
					break;
				case 'stop_sync':
					item.iconPath = item.isRun ? new ThemeIcon("vm-active") : new ThemeIcon("vm-outline");
					item.contextValue = item.isRun ? "tools_connect" : "tools_disconnect"
					await FileTransfer.changeAsyncStatus(item.config, 'stop', 'cancelled')
					deployInstances.get(getConfigScopeKey(item.config))?.cancel()
					break;
				case 'pause_sync':
					item.iconPath = new ThemeIcon("debug-pause");
					item.contextValue = "tools_sync_pause"
					await FileTransfer.changeAsyncStatus(item.config, 'pause')
					break;
				case 'restart_sync':
					item.iconPath = {
						dark: vscode.Uri.file(path.join(__filename, '..', '..', 'static', 'sync.svg')),
						light: vscode.Uri.file(path.join(__filename, '..', '..', 'static', 'sync_dark.svg'))
					};
					item.contextValue = "tools_sync"
					await FileTransfer.changeAsyncStatus(item.config, 'restart')
					break;
				default:
					break;
			}
		} catch (e) {
			if (e instanceof NoWatchFilesError) {
				item.iconPath = item.isRun ? new ThemeIcon("vm-active") : new ThemeIcon("vm-outline");
				item.contextValue = item.isRun ? "tools_connect" : "tools_disconnect"
			} else {
				this.evictNodeSubtree(item)
				item.iconPath = new ThemeIcon("vm-outline");
				item.contextValue = "tools_disconnect"
				item.collapsibleState = vscode.TreeItemCollapsibleState.None
				item.children = []
				item.isLoading = true
				item.isRun = false
			}
		} finally {
			obj[item.index] = item
			this._onDidChangeTreeData.fire();
			this.items = obj
		}

	}

	async getClient(config: FileTransferConfigItem) {
		let fileTransfer = new FileTransfer(config)
		let client = await fileTransfer.getClient(config, true)
		return { client, fileTransfer }
	}

	async releaseClient(client: FileTransferClient, config: FileTransferConfigItem) {
		let fileTransfer = new FileTransfer(config)
		await fileTransfer.releaseClient(client, config)
	}

	public getTreeItem(element: Dependency | RepositoryFileNode): vscode.TreeItem {
		return element;
	}


	refresh(status: boolean = false): void {
		if (status) {
			this.items = []
			this.allNodes.clear()
		}
		this.getMenu()
		this._onDidChangeTreeData.fire();
	}

	// 刷新特定节点
	async refreshEntry(obj: Dependency | RepositoryFileNode, type: string = 'refresh') {
		let node = obj
		switch (type) {
			case 'refresh':
				node.isLoading = true
				if (obj instanceof RepositoryFileNode) {
					if (!obj.file.isDirectory) {
						node = obj.parent
					}
				}
				break;
			case 'add':
				if (obj instanceof RepositoryFileNode) {
					if (!obj.file.isDirectory) {
						node = obj.parent
					}
				}
				break;
			case 'save':
				if (obj instanceof RepositoryFileNode) {
					node = obj.parent
				}
				break;
			case 'chmod':
				if (obj instanceof RepositoryFileNode) {
					node = obj.parent
				}
				break;
			case 'rename':
				if (obj instanceof RepositoryFileNode) {
					node = obj.parent
				}
				break;
			case 'delete':
				if (obj instanceof RepositoryFileNode) {
					node = obj.parent
				}
				break;
			default:
				break;
		}
		this.evictNodeSubtree(node, false)
		node.children = []
		this._onDidChangeTreeData.fire(node);

		if (['refresh', 'rename', 'delete'].includes(type)) {
			await this.clearFileCache(node)
		}
	}

	async clearFileCache(node: Dependency | RepositoryFileNode) {
		// 清理文件缓存
		try {
			if (node instanceof RepositoryFileNode) {
				let filePath = path.join(os.tmpdir(), CACHE_DIRNAME, getConfigCacheDirectoryName(node.config), node.config.type === 'ftp' ? node.realPath : path.relative(node.config.remotePath, node.realPath))
				await fs.promises.rm(filePath, { recursive: true, force: true })
			} else if (node instanceof Dependency) {
				let filePath = path.join(os.tmpdir(), CACHE_DIRNAME, getConfigCacheDirectoryName(node.config))
				await fs.promises.rm(filePath, { recursive: true, force: true })
			}
		} catch (error) {
			// cache directory may not exist, safe to ignore
		}
	}


	getCount() {
		return this.count
	}

	async getMenu() {
		const workspaceState = this.context.workspaceState;
		const workspaceRoots = getWorkspaceRoots();
		const showWorkspaceName = workspaceRoots.length > 1;
		const configList: Dependency[] = [];
		this.count = 0

		for (const workspaceRoot of workspaceRoots) {
			const config = await getUserConfig(2, 1, workspaceRoot)
			if (!config) continue
			for (const item of toArray(config, workspaceRoot)) {
				const cache_key = item.name + '###' + workspaceRoot
				const newGlobalData = workspaceState.get(cache_key);
				const workspaceName = path.basename(workspaceRoot);
				let tooltip = l10n.t('Server: {0}   Address: {1}', item.name, item.host);
				let description = showWorkspaceName ? `${workspaceName} · ${item.host}` : item.host;

				if (typeof newGlobalData === 'object' && newGlobalData !== null) {
					const count = Object.keys(newGlobalData).length
					if (count) {
						tooltip = l10n.t('Server: {0}   Address: {1}   Not uploaded: {2}', item.name, item.host, count);
						description = `(${count}) ${description}`;
					}
					this.count += count
				}
				configList.push(new Dependency(item, 0, tooltip, description, configList.length));
			}
		}
		this.items = configList
	}

	getAllNodes() {
		let obj = this.allNodes;
		return obj
	}

	// 添加单个节点，使用节点的唯一ID作为键
	private addNode(node: Dependency | RepositoryFileNode): void {
		this.allNodes.set(getConfigScopeKey(node.config) + "###" + node.realPath, node);
	}

	private evictNodeSubtree(node: Dependency | RepositoryFileNode, includeNode: boolean = true): void {
		const pending = includeNode ? [node] : [...node.children]
		while (pending.length) {
			const current = pending.pop()
			if (!current) continue
			pending.push(...current.children)
			this.allNodes.delete(getConfigScopeKey(current.config) + "###" + current.realPath)
		}
	}

	// 批量添加节点
	addNodes(...nodes: (Dependency | RepositoryFileNode)[]) {
		nodes.forEach(node => this.addNode(node));
	}

	getChildren(element?: TreeItem): ProviderResult<TreeItem[]> {
		if (!element) {
			this.addNodes(...this.items);
			return Promise.resolve(this.items);
		} else if (element instanceof Dependency) {
			if (element.isLoading) {
				setTimeout(() => {
					element.children = [];
					element.isLoading = false
					this._onDidChangeTreeData.fire(element);
				}, 50);
				return Promise.resolve([new LoadingNode()]);
			}
			if (element.children.length) {
				return Promise.resolve(element.children);
			}
			return this.getFileNodes(element, element.config.type == 'ftp' ? '/' : element.config.remotePath).then((fileNodes) => {
				// 将子节点添加到 Dependency 的 children 属性中
				element.children = fileNodes;
				this.addNodes(...element.children);
				return fileNodes;
			});
		} else if (element instanceof RepositoryFileNode) {
			if (element.isLoading) {
				setTimeout(() => {
					element.children = [];
					element.isLoading = false
					this._onDidChangeTreeData.fire(element);
				}, 50);
				return Promise.resolve([new LoadingNode()]);
			}
			if (element.children.length) {
				return Promise.resolve(element.children);
			}
			let parentPath = path.posix.join(element.parentPath, element.file.name);
			return this.getFileNodes(element, parentPath).then((fileNodes) => {
				// 将子节点添加到 RepositoryFileNode 的 children 属性中
				element.children = fileNodes;
				this.addNodes(...element.children);
				return fileNodes;
			});
		}
	}

	async getFileNodes(element: Dependency | RepositoryFileNode, remotePath: string) {
		let { client } = await this.getClient(element.config);
		if (!client) return []
		try {
			let files = await client.list(remotePath);
			await this.releaseClient(client, element.config);
			return this.mapFilesToNodes(files, element, remotePath);
		} catch (error) {
			await this.releaseClient(client, element.config);
			return []
		}
	}

	mapFilesToNodes(files: RemoteFileInfo[], element: Dependency | RepositoryFileNode, remotePath: string): RepositoryFileNode[] {
		let filesArr: RepositoryFile[] = [];
		for (const v of files) {
			const isFTP = element.config.type == 'ftp';
			const isValidFTP = isFTP && (v.type == 1 || v.type == 2);
			const isValidOther = !isFTP && (v.type == 'd' || v.type == '-');

			let permission = ''
			if (isFTP) {
				const ftpFile = v as FTPRemoteFileInfo;
				if (ftpFile.permissions) {
					permission = ftpFile.permissions.user + "" + ftpFile.permissions.group + "" + ftpFile.permissions.world
				}
			} else {
				permission = permissionsToOctal((v as SFTPFileInfo).rights)
			}

			if (isValidFTP || isValidOther) {
				filesArr.push({
					name: v.name,
					isDirectory: isFTP ? v.type === 2 : v.type === 'd',
					size: v.size,
					permission
				});
			}
		}
		filesArr = sortFiles(filesArr)
		return filesArr.map((file: RepositoryFile) => new RepositoryFileNode(file, element, remotePath));
	}

	private async openResource(obj: RepositoryFileNode, comparePath: string = ''): Promise<void> {
		let { client } = await this.getClient(obj.config)
		if (!client) return

		let filePath = path.join(os.tmpdir(), CACHE_DIRNAME, getConfigCacheDirectoryName(obj.config), obj.config.type === 'ftp' ? obj.realPath : path.relative(obj.config.remotePath, obj.realPath))

		let schemePath = path.posix.join(getConfigCacheDirectoryName(obj.config), obj.config.type, obj.parentPath, obj.file.name)
		const uri = vscode.Uri.parse(`${URI_SCHEME}:/${schemePath}`);
		let task: Task = {
			config: obj.config,
			localPath: filePath,
			remotePath: obj.realPath,
			operationType: 'download',
			isDirectory: false,
			view: true,
			progress: 0,
			fileSize: obj.file.size,
			fileSizeText: formatFileSize(obj.file.size),
			useTime: '',
			start: dayjs().format('YYYY-MM-DD HH:mm:ss'),
		}

		try {
			if (fs.existsSync(filePath) && !obj.isNew) {
				await this.releaseClient(client, obj.config);
				return await this.showRemoteFile(filePath, comparePath, uri, obj)
			}

			let syncConfig = getPluginSetting()
			const openFileSizeLimit = syncConfig.get<number>("openFileSizeLimit", 5)
			if (obj.file.size > openFileSizeLimit * 1024 * 1024) {
				let res = await showInformationMessage(
					l10n.t("The file size is {0}, exceeding the limit ({1} M). Are you sure you want to open it?", formatFileSize(obj.file.size), openFileSizeLimit),
					l10n.t('Confirm'),
					l10n.t('Cancel')
				)
				if (res != l10n.t('Confirm')) return
			}


			if (!fs.existsSync(path.dirname(filePath))) {
				fs.mkdirSync(path.dirname(filePath), { recursive: true })
			}
			addLogTask(task);

			if (obj.config.type === 'ftp' && isFTPClient(client)) {
				// 获取远程文件的大小
				const fileSize = await client.size(obj.realPath);

				// 设置进度跟踪
				if (client.trackProgress) {
					client.trackProgress((info: { name: string; type: string; bytes: number; bytesOverall: number }) => {
					if (info.type == 'download') {
						if (!fileSize) {
							task.useTime = getUseTime(task.start)
							task.progress = 100
							obj.isNew = false
						} else {
							const progress = Math.min(parseFloat(((info.bytes / fileSize) * 100).toFixed(2)), 100);
							oConsole.log(`下载进度: ${progress}% (${info.bytes} / ${fileSize} 字节)`);
							task.progress = progress
							if (progress >= 100 || !info.bytes) {
								task.useTime = getUseTime(task.start)
							}
						}
						updateTaskProgress();
					}
				});
				}
				await client.downloadTo(filePath, obj.realPath);
				if (client.trackProgress) {
					client.trackProgress()
				}
			} else if (isSFTPClient(client)) {
				let download = new Promise<void>((resolve, reject) => {
					try {
						if (client.fastGet) {
							client.fastGet(obj.realPath, filePath, {
								step: async (transferred: number, chunk: number, total: number) => {
									oConsole.log(`已传输: ${transferred}/${total} 字节`);
									let progress = Math.min(parseFloat(((transferred / total) * 100).toFixed(2)), 100);
									task.progress = progress
									if (progress >= 100) {
										obj.isNew = false
										task.useTime = getUseTime(task.start)
										updateTaskProgress(true);
										resolve();
									} else {
										updateTaskProgress();
									}
								}
							});
						}
					} catch (error) {
						reject(error);
					}
				});
				await download;
			}

			await this.showRemoteFile(filePath, comparePath, uri, obj)
			await this.releaseClient(client, obj.config);

		} catch (err) {
			await this.releaseClient(client, obj.config);
			if (err?.toString().indexOf('CodeExpectedError') != -1) {
				try {
					vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
				} catch (error) {
					this.showErrorMessage(task, obj, error);
				}
			} else {
				this.showErrorMessage(task, obj, err);
			}
		}
	}

	// 提取的错误提示函数
	showErrorMessage(task: Task, obj: RepositoryFileNode, err: unknown) {
		let msg = `[open][${obj.config.name}][${obj.config.type}][error] : ${obj.realPath} ${err?.toString()}`;
		task.error = err?.toString()
		updateTaskProgress(true);
		vscode.window.showErrorMessage(msg);
	}

	async showRemoteFile(filePath: string, comparePath: string, uri: vscode.Uri, obj: RepositoryFileNode) {
		try {
			let fileContent = fs.readFileSync(filePath, 'utf-8');
			const content = new TextEncoder().encode(fileContent);
			vscode.workspace.fs.writeFile(uri, content);
			if (comparePath) {
				// 执行对比命令
				vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(filePath), vscode.Uri.file(comparePath), `${l10n.t('Remote file')} ↔ ${l10n.t('Local file')}: ${obj.file.name}`);
			} else {
				const document = await vscode.workspace.openTextDocument(uri);
				vscode.window.showTextDocument(document, {
					preview: false,
					viewColumn: vscode.ViewColumn.Active,
				});
			}
		} catch (error) {
			throw error
		}
	}


	async saveFile(configScope: string, content: string, localPath: string, remotePath: string) {
		let obj = this.items.find(item => getConfigScopeKey(item.config) === configScope)
		if (!obj) return

		let { client, fileTransfer } = await this.getClient(obj.config)
		if (!client) return
		let newRemotePath = path.posix.join('/', remotePath)
		try {
			if (!fs.existsSync(path.dirname(localPath))) {
				fs.mkdirSync(path.dirname(localPath), { recursive: true })
			}
			fs.writeFileSync(localPath, content, 'utf-8')
			let task: Task = {
				config: obj.config,
				localPath: localPath,
				operationType: 'upload',
				remotePath: newRemotePath
			}
			let fileStat = fs.statSync(localPath)
			task.fileSize = fileStat.size
			task.fileSizeText = formatFileSize(task.fileSize)
			await fileTransfer.uploadFile(client, task)
			this.showLog(obj.config, 'save', 'success', newRemotePath)
			await this.releaseClient(client, obj.config)

			let saveObj = this.allNodes.get(getConfigScopeKey(task.config) + "###" + newRemotePath)
			if (saveObj && saveObj instanceof RepositoryFileNode && saveObj.file) {
				saveObj.file.size = fileStat.size
				saveObj.isNew = true
				// await this.refreshEntry(obj, 'save')
			}
		} catch (err) {
			await this.releaseClient(client, obj.config)
			let errMsg = `${newRemotePath} ${err?.toString()}`
			this.showLog(obj.config, 'save', 'error', errMsg)
			let msg = `[save][${obj.config.name}][${obj.config.type}][error]`;
			vscode.window.showErrorMessage(`${msg}：${errMsg}`)
		}
	}

	async addFileOrFolder(obj: Dependency | RepositoryFileNode, opType: number) {
		// 弹出文本输入框
		let text = opType == 1 ? l10n.t('File name') : l10n.t('Folder name')
		let showPath = obj instanceof Dependency ? obj.realPath : obj.file.isDirectory ? obj.realPath : path.dirname(obj.realPath)
		let value = await inputMsg({ prompt: l10n.t('Please enter the name to create') + text + `,${l10n.t('Current path is:')}${showPath}` })
		if (!value) return
		value = value.trim()

		let { client, fileTransfer } = await this.getClient(obj.config)
		if (!client) return

		let remotePath = ''
		if (obj instanceof Dependency) {
			remotePath = obj.config.type == 'ftp' ? "/" : obj.config.remotePath
		} else {
			remotePath = obj.contextValue == 'sync_file' ? obj.parentPath : obj.realPath
		}

		try {
			if (opType == 1) {
				let filePath = path.join(os.tmpdir(), CACHE_DIRNAME, getConfigCacheDirectoryName(obj.config), remotePath, value)
				!fs.existsSync(path.dirname(filePath)) && fs.mkdirSync(path.dirname(filePath), { recursive: true })
				fs.writeFileSync(filePath, ' ')
				const task: Task = {
					config: obj.config,
					localPath: filePath,
					operationType: 'upload',
					remotePath: path.posix.join(remotePath, value)
				}
				await fileTransfer.uploadFile(client, task)
				fs.unlinkSync(filePath)
			} else {
				await fileTransfer.checkExistFolder(obj.config, client, path.join(remotePath, value))
			}

			await this.releaseClient(client, obj.config)
			await this.refreshEntry(obj, 'add')
			this.showLog(obj.config, 'create', 'success', `${path.posix.join(remotePath, value)}`)
		} catch (err) {
			let errMsg = `${path.posix.join(remotePath, value)} ${err?.toString()}`
			this.showLog(obj.config, 'create', 'error', errMsg)
			let msg = `[create][${obj.config.name}][${obj.config.type}][error]`;
			vscode.window.showErrorMessage(`${msg}：${errMsg}`)
			await this.releaseClient(client, obj.config)
		}
	}


	async uploadFiles(obj: Dependency | RepositoryFileNode) {
		const options = [l10n.t('Upload file'), l10n.t('Upload folder')];
		const choice = await vscode.window.showQuickPick(options, {
			placeHolder: l10n.t('What would you like to upload?')
		})
		let select
		let isDirectory = false
		if (choice === l10n.t('Upload file')) {
			select = await vscode.window.showOpenDialog({
				canSelectMany: true,
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: l10n.t('Confirm')
			});
		} else if (choice === l10n.t('Upload folder')) {
			isDirectory = true
			select = await vscode.window.showOpenDialog({
				canSelectMany: true,
				canSelectFiles: false,
				canSelectFolders: true,
				openLabel: l10n.t('Confirm')
			});
		}
		if (select) {
			for (let v of select) {
				let remotePath = ''
				if (obj instanceof Dependency) {
					remotePath = path.join(obj.realPath, path.basename(v.fsPath))
				} else {
					remotePath = obj.file.isDirectory ? path.join(obj.realPath, path.basename(v.fsPath)) : path.join(path.dirname(obj.realPath), path.basename(v.fsPath))
				}
				await FileTransfer.addTask({
					config: obj.config,
					localPath: v.fsPath,
					remotePath: remotePath,
					operationType: 'upload',
					isDirectory,
					view: true
				});
			}
		}
	}

	async downloadFile(obj: Dependency | RepositoryFileNode) {
		let localPath = path.join(obj.config.downloadPath || obj.config.workspaceRoot || '', obj.config.type == 'ftp' ? obj.realPath : path.relative(obj.config.remotePath, obj.realPath))
		await FileTransfer.addTask({
			config: obj.config,
			localPath: localPath,
			remotePath: obj.realPath,
			operationType: 'download',
			isDirectory: obj instanceof Dependency ? true : obj.file.isDirectory,
			view: true
		});
	}

	async compareFile(obj: RepositoryFileNode) {
		let localPath = path.join(obj.config.downloadPath || obj.config.workspaceRoot || '', obj.config.type == 'ftp' ? obj.realPath : path.relative(obj.config.remotePath, obj.realPath))
		if (!fs.existsSync(localPath)) {
			return vscode.window.showErrorMessage(`${l10n.t('Local file {0} does not exist', localPath)}`);
		}
		await this.openResource(obj, localPath);
	}


	async renameFile(obj: RepositoryFileNode) {
		let text = obj.file.isDirectory ? l10n.t('File name') : l10n.t('Folder name')
		let value = await inputMsg({ value: path.basename(obj.realPath), prompt: l10n.t('Please enter a new') + text + `,${l10n.t('Current path is:')}${obj.realPath}` })
		if (!value) return
		value = value.trim()

		let { client, fileTransfer } = await this.getClient(obj.config)
		if (!client) return
		let newPath = path.join(path.dirname(obj.realPath), value)
		newPath = getNormalPath(newPath)
		try {
			await client.rename(obj.realPath, newPath);
			this.showLog(obj.config, 'rename', 'success', `${obj.realPath} -> ${newPath}`)
			await fileTransfer.releaseClient(client, obj.config)
			await this.refreshEntry(obj, 'rename')
			this.checkToClose(obj);
		} catch (err) {
			await fileTransfer.releaseClient(client, obj.config)
			let errMsg = `${obj.realPath} -> ${newPath} ${err?.toString()}`
			this.showLog(obj.config, 'rename', 'error', errMsg)
			let msg = `[rename][${obj.config.name}][${obj.config.type}][error]`;
			vscode.window.showErrorMessage(`${msg}：${errMsg}`)
		}
	}

	async chmodFile(obj: RepositoryFileNode) {
		let value = await inputMsg({ value: obj.file.permission, prompt: `${l10n.t('Please enter the new permission range 000-777,')}${l10n.t('Current path is:')}${obj.realPath}` })
		if (!value) return
		value = value.trim()

		if (!isValidLinuxPermission(value)) {
			return vscode.window.showErrorMessage(l10n.t('Permission error, permission range should be: 000-777'))
		}

		let { client, fileTransfer } = await this.getClient(obj.config)
		if (!client) return
		try {
			if (obj.config.type == 'ftp' && isFTPClient(client) && client.send) {
				const command = `CHMOD ${value} ${obj.realPath}`;
				await client.send(command);
			} else if (isSFTPClient(client) && client.chmod) {
				await client.chmod(obj.realPath, value);
			}
			this.showLog(obj.config, 'chmod', 'success', `${obj.realPath} ${value}`)
			await fileTransfer.releaseClient(client, obj.config)
			await this.refreshEntry(obj, 'chmod')
		} catch (err) {
			await fileTransfer.releaseClient(client, obj.config)
			let errMsg = `${obj.realPath} ${value}  ${err?.toString()}`
			this.showLog(obj.config, 'chmod', 'error', errMsg)
			let msg = `[chmod][${obj.config.name}][${obj.config.type}][error]`;
			vscode.window.showErrorMessage(`${msg}：${errMsg}`)
		}
	}

	async deleteFile(obj: RepositoryFileNode) {
		let res = await showInformationMessage(
			`${l10n.t('Are you sure you want to delete {0}?', obj.realPath)}`,
			l10n.t('Confirm'),
			l10n.t('Cancel')
		)
		if (res != l10n.t('Confirm')) return
		let { client, fileTransfer } = await this.getClient(obj.config)
		if (!client) return
		try {
			const task: Task = {
				config: obj.config,
				localPath: "",
				remotePath: obj.realPath,
				operationType: 'delete'
			}
			this.showLog(obj.config, 'delete', 'ready', `${obj.realPath}`)
			await fileTransfer.deleteFile(client, task, false)
			this.showLog(obj.config, 'delete', 'success', `${obj.realPath}`)
			await this.releaseClient(client, obj.config)
			await this.refreshEntry(obj, 'delete')
			this.checkToClose(obj);
		} catch (err) {
			await fileTransfer.releaseClient(client, obj.config)
			this.showLog(obj.config, 'delete', 'error', err?.toString())
			let msg = `[delete][${obj.config.name}][${obj.config.type}][error]`;
			vscode.window.showErrorMessage(`${msg}：${err?.toString()}`)
		}
	}


	//检查并关闭指定的文件编辑器
	checkToClose(obj: RepositoryFileNode, delete_cache: boolean = true) {
		const visibleEditors = vscode.workspace.textDocuments;
		// 你想要关闭的文件路径
		let fileToClose = path.posix.join('/', getConfigCacheDirectoryName(obj.config), obj.config.type, obj.realPath)

		// 查找要关闭的编辑器
		const editorsToClose = obj.file && obj.file.isDirectory
			? visibleEditors.filter(document => document.fileName.includes(fileToClose))
			: visibleEditors.filter(document => document.fileName === fileToClose);

		editorsToClose.forEach(editor => {
			// 将该编辑器设置为活动编辑器并关闭
			vscode.window.showTextDocument(editor).then(() => {
				vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			});
		});

		if (delete_cache) this.evictNodeSubtree(obj)
	}

	refreshCount() {
		// 获取 workspaceState 对象
		const workspaceState = this.context.workspaceState;
		if (Array.isArray(this.items)) {
			let arr = Array.from(this.items)
			let num = 0
			const showWorkspaceName = getWorkspaceRoots().length > 1
			arr.map((v) => {
				let cache_key = v.config.name + '###' + v.config.workspaceRoot
				// 从 workspaceState 中读取数据
				let newGlobalData = workspaceState.get(cache_key)
				let count = 0
				if (typeof newGlobalData === "object" && newGlobalData !== null) {
					count = Object.keys(newGlobalData).length
					num += count
				}
				const baseDescription = showWorkspaceName
					? `${path.basename(v.config.workspaceRoot || '')} · ${v.config.host}`
					: `${v.config.host}`;
				v.description = count ? `(${count}) ${baseDescription}` : baseDescription;
				let tooltip = l10n.t('Server: {0}   Address: {1}   Not uploaded: {2}', String(v.label ?? ''), v.config.host, count);
				v.tooltip = tooltip;
			})

			// 刷新树视图数据
			this._onDidChangeTreeData.fire();
			this.items = arr
			this.count = num
		}
	}

	// 清除缓存
	async clearCache(item: Dependency) {
		oConsole.log('清除缓存');
		// 获取 workspaceState 对象
		const workspaceState = this.context.workspaceState;
		let cache_key = item.config.name + '###' + item.config.workspaceRoot
		await clearWatchCache(workspaceState, cache_key)
		// 刷新视图显示
		myEvent.fire("update")
	}

	showLog(config: FileTransferConfigItem, type: string, status: string, msg: string = '') {
		let time = dayjs().format('YYYY-MM-DD HH:mm:ss')
		let txt = `[${time}][${config.name}][${config.type}][${type}][${status}]: ${msg}`;
		addLogTask(txt, config);
	}
}





