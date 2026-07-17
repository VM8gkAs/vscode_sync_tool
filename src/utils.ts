import fs from "fs-extra"
import type { Dirent, Stats } from "fs"
import path from "path"
import * as vscode from "vscode"
import { l10n } from "vscode"
import stripJsonComments from "strip-json-comments"
import { DeployConfigItem, FileTransferConfigItem, opType, PathChangeType, Permissions } from "./types/config"
// 默认配置
import { configText, getExampleText } from "./config/default"
// jsonc处理
import * as jsonc from "jsonc-parser"
// 文件排除
import { Minimatch } from "minimatch"
import { getContext } from "./config/globals"
import dayjs = require("dayjs")
import { execFile } from "child_process"


export type GitCommandResult = {
	stdout: string;
	stderr: string;
	code: number | null;
	signal?: NodeJS.Signals | null;
	timedOut?: boolean;
	errorCode?: string;
};

export type GitCommandRunner = (args: readonly string[], cwd: string) => Promise<GitCommandResult>;

const GIT_COMMAND_TIMEOUT_MS = 120000;

export const execGitCommand: GitCommandRunner = (args, cwd) => new Promise((resolve) => {
	execFile(
		"git",
		[...args],
		{
			cwd,
			windowsHide: true,
			timeout: GIT_COMMAND_TIMEOUT_MS,
			maxBuffer: 1024 * 1024
		},
		(error, stdout, stderr) => {
			if (!error) {
				resolve({ stdout, stderr, code: 0 });
				return;
			}

			const execError = error as NodeJS.ErrnoException & {
				code?: string | number;
				killed?: boolean;
				signal?: NodeJS.Signals | null;
			};
			resolve({
				stdout,
				stderr: stderr || execError.message,
				code: typeof execError.code === "number" ? execError.code : null,
				signal: execError.signal ?? null,
				timedOut: execError.killed === true && execError.signal === "SIGTERM",
				errorCode: typeof execError.code === "string" ? execError.code : undefined
			});
		}
	);
});

export function sleep(ms: number = 1000) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export const oConsole = {
	log: (...message: any[]) => {
		console.log(...message)
	},
	// 成功信息
	succeed: (...message: any[]) => {
		console.log(...message)
	},
	// 提示信息
	info: (...message: any[]) => {
		console.log(...message)
	},
	// 错误信息
	error: (...message: any[]) => {
		console.error(...message)
	}
}


//获取插件配置
export const getPluginSetting = (workspaceRoot?: string) => {
	const scope = workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined
	return vscode.workspace.getConfiguration("SyncTools", scope)
}

type CompiledIgnoreRule = {
	raw: string;
	pattern: string;
	negated: boolean;
	literalPrefix: string;
	matcher: Minimatch;
	childMatcher: Minimatch;
};

export type PathIgnoreMatcher = {
	isIgnored: (file: string) => boolean;
	shouldTraverse: (directory: string) => boolean;
};

const ignoreMatcherCache = new Map<string, CompiledIgnoreRule[]>();
const maxIgnoreMatcherCacheSize = 100;

function getIgnoreCacheKey(ignoreArr: string[]) {
	return ignoreArr.map(rule => getNormalPath(rule)).join("\0");
}

function compileIgnoreRules(ignoreArr: string[] = []) {
	const key = getIgnoreCacheKey(ignoreArr);
	const cached = ignoreMatcherCache.get(key);
	if (cached) {
		return cached;
	}

	const rules = ignoreArr.flatMap((rule): CompiledIgnoreRule[] => {
		const normalizedRule = getNormalPath(rule.trim());
		const negated = normalizedRule.startsWith("!");
		const pattern = (negated ? normalizedRule.slice(1) : normalizedRule)
			.replace(/^\.\//, "")
			.replace(/^\/+/, "")
			.replace(/\/+$/, "");
		if (!pattern || pattern === ".." || pattern.startsWith("../") || /^[A-Za-z]:\//.test(pattern)) {
			return [];
		}
		const globIndex = pattern.search(/[*?[\]{}()]/);
		const literalPrefix = (globIndex === -1 ? pattern : pattern.slice(0, globIndex))
			.replace(/\/+$/, "");
		return [{
			raw: `${negated ? "!" : ""}${pattern}`,
			pattern,
			negated,
			literalPrefix,
			matcher: new Minimatch(pattern, { dot: true }),
			childMatcher: new Minimatch(`${pattern}/**`, { dot: true })
		}];
	});

	ignoreMatcherCache.set(key, rules);
	if (ignoreMatcherCache.size > maxIgnoreMatcherCacheSize) {
		const oldestKey = ignoreMatcherCache.keys().next().value;
		if (oldestKey !== undefined) {
			ignoreMatcherCache.delete(oldestKey);
		}
	}

	return rules;
}

function getRelativeIgnorePath(rootPath: string, file: string): string | null {
	const usePosix = rootPath.startsWith("/") && file.startsWith("/");
	const relative = usePosix
		? path.posix.relative(getNormalPath(rootPath), getNormalPath(file))
		: path.relative(path.resolve(rootPath), path.resolve(file));
	const normalized = getNormalPath(relative || ".");
	if (normalized === ".." || normalized.startsWith("../") || path.isAbsolute(relative)) {
		return null;
	}
	return normalized === "." ? "" : normalized;
}

function canNegationMatchDescendant(rule: CompiledIgnoreRule, directory: string) {
	if (!rule.negated) {
		return false;
	}
	if (!directory || !rule.literalPrefix) {
		return true;
	}
	return rule.literalPrefix === directory
		|| rule.literalPrefix.startsWith(`${directory}/`)
		|| directory.startsWith(`${rule.literalPrefix}/`);
}

export function createPathIgnoreMatcher(ignoreArr: string[] = [], rootPath: string): PathIgnoreMatcher {
	const rules = compileIgnoreRules(ignoreArr);
	const isIgnored = (file: string) => {
		const normalizedPath = getRelativeIgnorePath(rootPath, file);
		if (normalizedPath === null) {
			return true;
		}
		let ignored = false;
		for (const rule of rules) {
			if (rule.matcher.match(normalizedPath) || rule.childMatcher.match(normalizedPath)) {
				ignored = !rule.negated;
			}
		}
		return ignored;
	};
	return {
		isIgnored,
		shouldTraverse: (directory: string) => {
			const normalizedPath = getRelativeIgnorePath(rootPath, directory);
			if (normalizedPath === null) {
				return false;
			}
			return !isIgnored(directory) || rules.some(rule => canNegationMatchDescendant(rule, normalizedPath));
		}
	};
}

export function getNegatedTraversalRoot(rootPath: string, rule: string): string | null {
	const normalizedRule = getNormalPath(rule);
	if (!normalizedRule.startsWith("!")) {
		return null;
	}

	const pattern = normalizedRule.slice(1).replace(/^\/+/, "");
	if (!pattern) {
		return rootPath;
	}

	const globIndex = pattern.search(/[*?[\]{}()]/);
	let literalPath = pattern;
	if (globIndex !== -1) {
		const literalPrefix = pattern.slice(0, globIndex);
		if (literalPrefix.endsWith("/")) {
			literalPath = literalPrefix.slice(0, -1);
		} else {
			const parent = path.posix.dirname(literalPrefix);
			literalPath = parent === "." ? "" : parent;
		}
	}

	const candidate = path.resolve(rootPath, literalPath || ".");
	const relative = path.relative(rootPath, candidate);
	const isInsideRoot = relative === ""
		|| (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));

	return isInsideRoot ? candidate : null;
}


// 询问对话框同步版
export const showInformationMessage = (msg: string, confirmText = l10n.t('Confirm'), cancelText = l10n.t('Cancel')) => {
	return new Promise((resolve, reject) => {
		vscode.window.showInformationMessage(
			msg,
			confirmText,
			cancelText
		).then((value) => {
			resolve(value)
		});
	})
}


/**
 * 取得目前所有 workspace folder 路徑。
 */
export function getWorkspaceRoots(): string[] {
	return (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
}

/**
 * 取得檔案所屬 workspace folder。多根工作區未指定檔案時不猜測根目錄。
 */
export function getRootPath(file: string = ""): string {
	const workspaceFolders = vscode.workspace.workspaceFolders || [];
	if (!file) {
		return workspaceFolders.length === 1 ? workspaceFolders[0].uri.fsPath : "";
	}

	const workspaceFolder = vscode.workspace.getWorkspaceFolder?.(vscode.Uri.file(file));
	return workspaceFolder?.uri.fsPath || "";
}

export function getConfigScopeKey(config: Pick<FileTransferConfigItem, "name" | "workspaceRoot">): string {
	return `${config.workspaceRoot || ""}###${config.name}`;
}

export const DEFAULT_SYNC_LOG_DIRECTORY = "sync_logs";

export function resolveSyncLogDirectory(
	workspaceRoot: string,
	relativeDirectory: unknown = DEFAULT_SYNC_LOG_DIRECTORY
): string | null {
	if (!workspaceRoot || typeof relativeDirectory !== "string") return null;

	const configuredDirectory = relativeDirectory.trim();
	if (!configuredDirectory || path.isAbsolute(configuredDirectory)) return null;

	const resolvedRoot = path.resolve(workspaceRoot);
	const resolvedDirectory = path.resolve(resolvedRoot, configuredDirectory);
	const relative = path.relative(resolvedRoot, resolvedDirectory);
	if (
		!relative
		|| relative === ".."
		|| relative.startsWith(`..${path.sep}`)
		|| path.isAbsolute(relative)
	) {
		return null;
	}

	return resolvedDirectory;
}

export function getConfigCacheDirectoryName(config: Pick<FileTransferConfigItem, "name" | "workspaceRoot">): string {
	return encodeURIComponent(getConfigScopeKey(config));
}

export function getWorkspaceStateKey(prefix: string, rootPath: string, name: string = ""): string {
	return [prefix, rootPath, name].filter(Boolean).join("###");
}

export function normalizeTraversalConcurrency(value: unknown, fallback: number, maximum: number = 16): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(maximum, Math.max(1, Math.floor(parsed)));
}

function isMissingPathError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function createAsyncLimiter(maxConcurrency: number) {
	let active = 0;
	const waiters: Array<() => void> = [];

	return async function runLimited<T>(operation: () => Promise<T>): Promise<T> {
		if (active >= maxConcurrency) {
			await new Promise<void>(resolve => waiters.push(resolve));
		}
		active++;
		try {
			return await operation();
		} finally {
			active--;
			waiters.shift()?.();
		}
	};
}

/**
 * 获取某个目录下所有文件
 * @param dir
 * @param is_ignore 是否需要忽略文件或文件夹
 * @param ignore_arr
 * @returns
 */
export const getAllFiles = async (
	dir: string,
	is_ignore: boolean = false,
	ignore_arr: string[] = [],
	concurrency: number = 4
) => {
	const traversalRoot = getRootPath(dir) || dir;
	const ignoreMatcher = is_ignore ? createPathIgnoreMatcher(ignore_arr, traversalRoot) : undefined;
	const readDirectory = createAsyncLimiter(normalizeTraversalConcurrency(concurrency, 4));

	const walk = async (currentPath: string): Promise<string[]> => {
		let stat: Stats;
		try {
			stat = await fs.promises.lstat(currentPath);
		} catch (error) {
			if (isMissingPathError(error)) return [];
			throw error;
		}

		if (!stat.isDirectory()) {
			return !ignoreMatcher || !ignoreMatcher.isIgnored(currentPath) ? [currentPath] : [];
		}
		if (ignoreMatcher && !ignoreMatcher.shouldTraverse(currentPath)) return [];

		let entries: Dirent[];
		try {
			entries = await readDirectory(() => fs.promises.readdir(currentPath, { withFileTypes: true }));
		} catch (error) {
			if (isMissingPathError(error)) return [];
			throw error;
		}

		const parts = await Promise.all(entries.map(async entry => {
			const itemPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				if (ignoreMatcher && !ignoreMatcher.shouldTraverse(itemPath)) return [];
				return walk(itemPath);
			}
			return !ignoreMatcher || !ignoreMatcher.isIgnored(itemPath) ? [itemPath] : [];
		}));
		return parts.flat();
	}

	return walk(dir)
}

/**
 * 获取需要上传的文件
 * @param context
 * @param obj
 * @param rootPath
 * @param file
 * @returns
 */
export const getAllowFiles = async (
	config: FileTransferConfigItem,
	file: string,
	view: boolean = false,
) => {
	if (!file) return false
	let rootPath = config.workspaceRoot || getRootPath(file)
	if (!rootPath) return false
	let ignore_arr = await getIgnoreConfig(config, file, view)
	let arr: string[] = []
	const seenFiles = new Set<string>();
	const addFile = (target: string) => {
		if (!seenFiles.has(target)) {
			seenFiles.add(target);
			arr.push(target);
		}
	};
	//区分根目录和非根目录
	if (rootPath == file) {
		let files = await getAllFiles(file, true, ignore_arr, config.localTraversalConcurrency)
		files.forEach(addFile)
	} else {
		if (!view) {
			let new_path = path.relative(rootPath, file)
			ignore_arr.push("!" + new_path)
		}
		let files = await getAllFiles(file, true, ignore_arr, config.localTraversalConcurrency)
		files.forEach(addFile)
	}
	return arr
}

// 检查是否在排除范围内
export const isIgnore = async (ignore_arr: string[] = [], file: string, flag: boolean = false) => {
	const rootPath = flag ? "/" : getRootPath(file)
	if (!rootPath) return true
	return createPathIgnoreMatcher(ignore_arr, rootPath).isIgnored(file)
}

//获取忽略配置
function normalizeDirectoryForCompare(file: string) {
	const normalized = getNormalPath(path.resolve(path.dirname(file)))
	return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

export function getPathChangeType(oldPath: string, newPath: string): PathChangeType {
	return normalizeDirectoryForCompare(oldPath) === normalizeDirectoryForCompare(newPath)
		? "rename"
		: "move"
}

export const resolveWatchChangeForIgnore = async (
	ignore_arr: string[] = [],
	file: string,
	opTypeValue: opType
): Promise<{ file: string; opType: opType } | null> => {
	const sourceIgnored = await isIgnore(ignore_arr, file)
	if (opTypeValue.op !== "rename" || !opTypeValue.newname) {
		return sourceIgnored ? null : { file, opType: opTypeValue }
	}

	const targetIgnored = await isIgnore(ignore_arr, opTypeValue.newname)
	const pathChangeType = getPathChangeType(file, opTypeValue.newname)
	if (sourceIgnored && targetIgnored) {
		return null
	}
	if (!sourceIgnored && targetIgnored) {
		return { file, opType: { op: "delete", type: opTypeValue.type } }
	}
	if (sourceIgnored && !targetIgnored) {
		return { file: opTypeValue.newname, opType: { op: "add", type: opTypeValue.type } }
	}
	return { file, opType: { ...opTypeValue, pathChangeType } }
}

export const getIgnoreConfig = (
	config: FileTransferConfigItem,
	file: string = "",
	_view: boolean = false
) => {
	let context = getContext()
	let rootPath = config.workspaceRoot || getRootPath(file)
	if (!rootPath) return Promise.resolve<string[]>([])

	let name = config.name
	//获取插件配置
	let syncConfig = getPluginSetting(rootPath)
	const excludePath = syncConfig.get("excludePath")

	const useGitignore = syncConfig.get<boolean>("gitignore")

	return new Promise<string[]>(async (resolve, reject) => {
		// 获取 workspaceState 对象
		const workspaceState = context.workspaceState
		const ignoreCacheKey = getWorkspaceStateKey("ignore_config", rootPath, name)
		const value = workspaceState.get(ignoreCacheKey)
		let ignore_arr: string[] = []
		let ignore_temp: string[] = []

		//默认忽略配置
		if (Array.isArray(excludePath)) {
			ignore_temp = [...ignore_temp, ...excludePath]
		}

		//用户忽略配置
		if (config.excludePath) {
			if (Array.isArray(config.excludePath)) {
				ignore_temp = [...ignore_temp, ...config.excludePath]
			} else {
				ignore_temp = [...ignore_temp, ...config.excludePath.split(",")]
			}
		}

		if (syncConfig.get<boolean>("logToFile", false)) {
			const configuredDirectory = syncConfig.get<string>("logDirectory", DEFAULT_SYNC_LOG_DIRECTORY)
			const logDirectory = resolveSyncLogDirectory(rootPath, configuredDirectory)
			if (logDirectory) {
				ignore_temp.push(getNormalPath(path.relative(rootPath, logDirectory)))
			}
		}


		if (useGitignore) {
			//  存在配置则使用配置，减少读写文件开销
			if (value && Array.isArray(value)) {
				ignore_temp = [...ignore_temp, ...value]
			} else {
				let gitignorePath = path.join(rootPath, ".gitignore")
				let data = ""
				if (fs.existsSync(gitignorePath)) {
					data = fs.readFileSync(gitignorePath, "utf-8")
					// 去除注释并将结果转换为数组
					let new_data = data
						.split("\n")
						.map((line: string) => line.trim())
						.filter((line: string) => line && !line.startsWith("#"))
					ignore_temp = [...ignore_temp, ...new_data]

					//  更新配置
					await workspaceState.update(ignoreCacheKey, new_data)
				}
			}
		}

		ignore_temp.forEach((v) => {
			// 重写规则
			ignore_arr.push(v)
			ignore_arr.push(path.join(v, "**"))
		})

		//数组去重
		ignore_arr = [...new Set(ignore_arr)]
		if (!ignore_arr.includes("sync_config.jsonc")) {
			ignore_arr.push("sync_config.jsonc")
		}
		resolve(ignore_arr)
	})
}

//将配置转化为数组
type SyncConfigRecord = Record<string, Record<string, unknown>>

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseConfigObject(jsonText: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(stripJsonComments(jsonText))
	return isObjectRecord(parsed) ? parsed : {}
}

function parseSyncConfigRecord(jsonText: string): SyncConfigRecord {
	const parsed = parseConfigObject(jsonText)
	const config: SyncConfigRecord = {}
	for (const [key, value] of Object.entries(parsed)) {
		if (!isObjectRecord(value)) {
			throw new Error(`Invalid sync config entry: ${key}`)
		}
		config[key] = value
	}
	return config
}

function isSyncConfigRecord(value: unknown): value is SyncConfigRecord {
	if (!isObjectRecord(value)) return false
	return Object.values(value).every(isObjectRecord)
}

function cloneConfigDefaults(defaults: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(defaults).map(([key, value]) => [
			key,
			Array.isArray(value) ? [...value] : value
		])
	)
}

function normalizeConfigEntry(
	entry: Record<string, unknown>,
	defaults: Record<string, unknown> = {},
	typeOverride?: string
) {
	const config = Object.assign(cloneConfigDefaults(defaults), entry)
	const type = typeOverride || (typeof config.type === "string" ? config.type : "")
	if (typeof config.port === 'string') {
		config.port = type === 'ftp' ? 21 : 22
	}

	setDefaultConfig(config, type)
	if (typeof config.remotePath === "string" && config.remotePath) {
		config.remotePath = getNormalPath(path.posix.join('/', config.remotePath))
	}
	return config
}

//将配置转化为数组
export const toArray = (obj: SyncConfigRecord, workspaceRoot: string = ""): FileTransferConfigItem[] => {
	const arr: FileTransferConfigItem[] = []
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const element = obj[key]
			arr.push({
				name: key,
				...Object.assign(
					{
						watch: true,
						upload_on_save: false,
						submit_git_before_upload: false,
						submit_git_msg: "",
						compress: false,
						build: "",
						distPath: "",
						deleteRemote: false
					},
					element
				),
				workspaceRoot
			} as FileTransferConfigItem)
		}
	}
	return arr
}

async function selectConfig(jsonText: string) {
	let currConfigJson = JSON.parse(stripJsonComments(jsonText))
	const label = await vscode.window.showInputBox({
		prompt: l10n.t('Please enter an environment name, e.g., test'), // 输入框的提示文本
		placeHolder: l10n.t("Please enter an environment name"), // 输入框的占位文本
		value: "", // 输入框的默认值
		password: false, // 是否以密码模式显示输入（输入内容会被隐藏）
		ignoreFocusOut: true, // 是否在失去焦点时保持输入框打开
		validateInput: (text) => {
			// 可选的输入验证函数，返回错误提示或 null
			if (!text || text.length < 1) {
				return l10n.t('Please enter an environment name')
			}
			if (currConfigJson[text]) {
				return l10n.t('This environment already exists, please re-enter')
			}
			return null
		}
	})
	if (!label) {
		return false
	}

	let clientArr = ['ftp', 'sftp', 'ssh']
	const clientType = await vscode.window.showQuickPick(clientArr, {
		placeHolder: l10n.t('Please select a connection type'), // 快速选择菜单的占位文本
		ignoreFocusOut: true,
		canPickMany: false // 开启多选
	})
	if (!clientType) {
		return false
	}

	const options = [
		{
			label: l10n.t('Use proxy'),
			description: l10n.t('Please configure proxy IP and port in the plugin settings, otherwise, the server cannot be connected'),
			value: "compress",
			picked: false
		},
		{
			label: l10n.t('Real-time submission after saving'),
			description: l10n.t('Recommended for single-person development. When upload_on_save is set to true, submit_git_before_upload is disabled. Default is false'),
			value: "upload_on_save",
			picked: false
		},
		{
			label: l10n.t('Monitor file changes'),
			description: l10n.t('Default is false; if upload_on_save is true, this option is invalid'),
			value: "watch",
			picked: false
		},
		{
			label: l10n.t('Submit local git before uploading code'),
			description: l10n.t('Recommended for team development to prevent overwriting remote code'),
			value: "submit_git_before_upload",
			picked: false
		},
		{
			label: l10n.t('Compress before uploading'),
			description: l10n.t('Only SSH supports remote decompression; others require manual decompression'),
			value: "compress",
			picked: false
		},
		{
			label: l10n.t('Delete remote directory before uploading'),
			description: l10n.t('Delete remote distPath configuration directory before upload, usually for cleaning up frontend deployment code'),
			value: "deleteRemote",
			picked: false
		},
		{
			label: l10n.t('Upload to root directory'),
			description: l10n.t('Generally used for frontend deployment code; effective only if distPath has a single path'),
			value: "upload_to_root",
			picked: false
		},
		{
			label: l10n.t('Is this the default configuration'),
			description: l10n.t('Used for right-click upload and remote file comparison'),
			value: "default",
			picked: false
		}
	]

	const selectedOptions = await vscode.window.showQuickPick(options, {
		placeHolder: l10n.t('Please select configuration (checked is true, unchecked is false)'), // 快速选择菜单的占位文本
		canPickMany: true, // 开启多选
		ignoreFocusOut: true // 点击选项后不会自动关闭
	})
	if (!selectedOptions) {
		return false
	}

	let newConfig: Record<string, boolean | string> = {}
	if (selectedOptions) {
		// 用户选择了一个或多个选项
		selectedOptions.forEach((option) => {
			newConfig[option.value] = true
		})
	}

	newConfig['type'] = clientType

	let configJson = normalizeConfigEntry(parseConfigObject(configText), {}, clientType)

	if (clientType === 'ftp') {
		delete configJson.remotePath
	}

	Object.assign(configJson, newConfig)

	// make edits and apply them
	let keys: string[] = [label]
	const edits = jsonc.modify(jsonText, [...keys], configJson, {})
	const updated = jsonc.applyEdits(jsonText, edits)

	// format the updated text
	const formatted = jsonc.format(updated, undefined, {})
	const res = jsonc.applyEdits(updated, formatted)
	return res
}

function addGitignore(rootPath: string) {
	let gitignorePath = path.join(rootPath, ".gitignore")
	let data = ""
	if (fs.existsSync(gitignorePath)) {
		data = fs.readFileSync(gitignorePath, "utf-8")
		// 去除注释并将结果转换为数组
		let new_data = data
			.split("\n")
			.map((line: string) => line.trim())
			.filter((line: string) => line && !line.startsWith("#"))
		// 如果gitignore中不存在sync_config.jsonc则加入
		const configFilepath = path.join(rootPath, "sync_config.jsonc")
		if (fs.existsSync(configFilepath) && !new_data.includes("sync_config.jsonc")) {
			fs.appendFileSync(gitignorePath, "\nsync_config.jsonc", 'utf-8')
		}
	}
}

/**
 * 添加配置
 * @param context  上下文
 * @param rootPath 项目路径
 * @returns
 */
export async function addConfig(rootPath: string) {
	try {
		let context = getContext();
		// 获取 workspaceState 对象
		const workspaceState = context.workspaceState
		const filepath = path.join(rootPath, "sync_config.jsonc")
		addGitignore(rootPath)
		if (!fs.existsSync(filepath)) {
			let updatedConfigData = await selectConfig(getExampleText())
			if (!updatedConfigData) {
				return
			}

			fs.writeFileSync(filepath, updatedConfigData, "utf8")
		} else {
			let data = fs.readFileSync(filepath, "utf-8")
			let updatedConfigData = await selectConfig(data)
			if (!updatedConfigData) {
				return
			}
			// 写入更新后的配置文件
			fs.writeFileSync(filepath, updatedConfigData, "utf8")
		}

		//打开配置文件
		vscode.workspace.openTextDocument(filepath).then((document) => {
			vscode.window.showTextDocument(document).then(() => {
				// vscode.window.showInformationMessage(l10n.t('已创建配置文件：sync_config.jsonc'));
			})
		})

		let data = fs.readFileSync(filepath, "utf-8")
		if (data) {
			let res = JSON.parse(stripJsonComments(data))
			await workspaceState.update(getWorkspaceStateKey("sync_config", rootPath), res)
		}
	} catch (error) {

		vscode.window.showInformationMessage(l10n.t('sync_config.jsonc configuration file format error!'))
	}
}

/**
 * 获取用户配置
 * @param context  上下文
 * @param rootPath 项目路径
 * @param type 创建配置文件 1需要 2不需要
 * @param showErr 显示异常 1需要 2不需要
 * @returns
 */
export async function getUserConfig(
	type: number = 1,
	showErr = 1,
	workspaceRoot: string = ""
): Promise<SyncConfigRecord | false> {
	try {
		let context = getContext()
		let rootPath = workspaceRoot || getRootPath()
		if (!rootPath) return false
		// 获取 workspaceState 对象
		const workspaceState = context.workspaceState
		const syncConfigKey = getWorkspaceStateKey("sync_config", rootPath)
		const value = workspaceState.get(syncConfigKey)
		//  存在配置直接返回
		if (value && type === 2 && isSyncConfigRecord(value)) {
			return value
		}

		const configData = configText ? parseConfigObject(configText) : {}

		const filepath = path.join(rootPath, "sync_config.jsonc")
		addGitignore(rootPath)
		if (!fs.existsSync(filepath)) {
			if (type < 2) {
				let obj = await selectConfig(getExampleText())
				if (!obj) {
					return false
				}
				fs.writeFileSync(filepath, obj, "utf8")
				vscode.workspace.openTextDocument(filepath).then((document) => {
					vscode.window.showTextDocument(document).then(() => {
						vscode.window.showInformationMessage(
							l10n.t('Configuration file created: sync_config.jsonc')
						)
					})
				})
			} else {
				vscode.commands.executeCommand("setContext", "canEdit", false);
			return {}
		}
		}
		let data = fs.readFileSync(filepath, "utf-8")

		if (data) {
			let res = parseSyncConfigRecord(data)
			for (const [key, value] of Object.entries(res)) {
				res[key] = normalizeConfigEntry(value, configData)
			}
			await workspaceState.update(syncConfigKey, res)
			vscode.commands.executeCommand("setContext", "canEdit", true);

			return res
		} else {
			return {}
		}
	} catch (error) {

		if (showErr) {
			vscode.window.showInformationMessage(
				l10n.t('sync_config.jsonc configuration file format error!')
			)
		}
		return false
	}
}

function setDefaultConfig(config: Record<string, unknown>, type: string) {
	const properties = ['remote_unpacked', 'delete_remote_compress', 'delete_local_compress'];

	properties.forEach(prop => {
		if (config[prop] === undefined || typeof config[prop] === 'string') {
			config[prop] = type === 'ssh';
		}
	});

	if (config['syncFileTime'] === undefined) {
		config['syncFileTime'] = false
	}
	if (config['skipIfSame'] === undefined) {
		config['skipIfSame'] = config['skipIfSameSize'] ?? true
	}
	delete config['skipIfSameSize']
	if (!config['skipCompareMode']) {
		config['skipCompareMode'] = "size+mtime"
	}
	if (config['uploadDelay'] === undefined) {
		config['uploadDelay'] = 0
	}
	config['localTraversalConcurrency'] = normalizeTraversalConcurrency(config['localTraversalConcurrency'], 4)
	config['downloadTraversalConcurrency'] = normalizeTraversalConcurrency(config['downloadTraversalConcurrency'], 2)
}

// 检测git是否提交
export const checkSubmitGit = async (workspaceRoot: string, config: DeployConfigItem) => {
	let { submit_git_before_upload, submit_git_msg } = config
	if (!submit_git_before_upload) return true

	const msg = submit_git_msg || await inputMsg({ prompt: l10n.t('Please enter git commit message') }, true)
	if (!msg.trim()) {
		throw new Error(`\n ${l10n.t('No git commit information was entered')} \n`)
	}

	await runSubmitGit(workspaceRoot, msg)
	return true
}

export type GitSubmitResult = {
	committed: boolean;
	noChanges: boolean;
	pushed: boolean;
};

export async function runSubmitGit(
	workspaceRoot: string,
	message: string,
	runGitCommand: GitCommandRunner = execGitCommand
): Promise<GitSubmitResult> {
	const commitMessage = message.trim()
	if (!commitMessage) {
		throw new Error(`\n ${l10n.t('No git commit information was entered')} \n`)
	}

	await expectGitOk("add", await runGitCommand(["add", "."], workspaceRoot))
	const diffResult = await runGitCommand(["diff", "--cached", "--quiet"], workspaceRoot)
	if (diffResult.code === 0) {
		await expectGitOk("push", await runGitCommand(["push"], workspaceRoot))
		return { committed: false, noChanges: true, pushed: true }
	}
	if (diffResult.code !== 1) {
		throwGitFailure("diff", diffResult)
	}

	await expectGitOk("commit", await runGitCommand(["commit", "-m", commitMessage], workspaceRoot))
	await expectGitOk("push", await runGitCommand(["push"], workspaceRoot))
	return { committed: true, noChanges: false, pushed: true }
}

function expectGitOk(step: string, result: GitCommandResult) {
	if (result.code === 0) return
	throwGitFailure(step, result)
}

function throwGitFailure(step: string, result: GitCommandResult): never {
	const kind = getGitFailureKind(step, result)
	const detail = [result.stderr, result.stdout]
		.map(text => text.trim())
		.filter(Boolean)
		.join("\n")
	throw new Error(`\n ${l10n.t('Git commit failed, please commit manually')} \n[${step}:${kind}]${detail ? `\n${detail}` : ""}`)
}

function getGitFailureKind(step: string, result: GitCommandResult) {
	if (result.timedOut) return "timeout"
	if (result.errorCode === "ENOENT") return "git-not-found"
	if (step === "push" && isGitAuthenticationFailure(result)) return "authentication"
	if (step === "push") return "push"
	if (step === "diff") return "status"
	return "command"
}

function isGitAuthenticationFailure(result: GitCommandResult) {
	const text = `${result.stderr}\n${result.stdout}`.toLowerCase()
	return [
		"authentication",
		"permission denied",
		"publickey",
		"could not read username",
		"could not read password",
		"access denied",
		"403",
		"401"
	].some(pattern => text.includes(pattern))
}

export function inputMsg(option: vscode.InputBoxOptions, isGit: boolean = false) {
	return new Promise<string>((resolve, reject) => {
		// 弹出文本输入框
		vscode.window
			.showInputBox(option)
			.then((value) => {
				if (value) {
					if (!value.trim()) {
						isGit && vscode.window.showInformationMessage(l10n.t('Commit message cannot be empty, please re-enter!'), l10n.t('Got it')
						)
						resolve(inputMsg(option))
					} else {
						resolve(value)
					}
				} else {
					if (isGit) {
						reject(`\n ${l10n.t('No git commit information was entered')} \n`)
					} else {
						resolve('')
					}
				}
			})
	})
}

//获取文件大小
export const getFileSizeFsExtra = async (filePath: string) => {
	try {
		const stats = await fs.stat(filePath)
		const fileSizeInBytes = stats.size
		return fileSizeInBytes
	} catch (err) {
		return null
	}
}

//验证配置
export const verityConfig = async (config: DeployConfigItem) => {
	let { host, username, password, privateKeyPath, remotePath, type } = config
	let typeArr = ["ftp", "sftp", "ssh"]
	if (!type || !typeArr.includes(type)) {
		throw new Error(l10n.t('Please configure server protocol type [type], e.g., ftp, sftp, ssh'))
	}
	if (!host) {
		throw new Error(l10n.t('Please configure server address [host]'))
	}
	if (!username) {
		throw new Error(l10n.t('Please configure username [username]'))
	}
	const hasPassword = Boolean(password)
	const hasPrivateKeyPath = Boolean(privateKeyPath)
	const privateKeyExists = hasPrivateKeyPath ? fs.existsSync(privateKeyPath as string) : false

	if (type == 'ftp' && !password) {
		throw new Error(l10n.t('FTP only supports password authentication. Please configure [password]'))
	}
	if (type != 'ftp' && hasPrivateKeyPath && !privateKeyExists && !hasPassword) {
		throw new Error(l10n.t('The configured [privateKeyPath] does not exist, and [password] is empty. Please provide a valid private key file or password'))
	}
	if (type != 'ftp' && !hasPassword && !hasPrivateKeyPath) {
		throw new Error(l10n.t('Please configure authentication: [privateKeyPath] (preferred) or [password]'))
	}
	if (type != 'ftp' && !remotePath) {
		throw new Error(l10n.t('Please configure server file directory [remotePath]'))
	}
}

/**
 * 判断是否需要上传到根目录
 * @param config 部署配置项
 * @param remotePath 远程路径
 * @param rootPath 根路径
 * @returns 返回一个对象，包含是否需要上传到根目录的布尔值 up_to_root 和处理后的远程路径 remotePath
 */
export const isUpRoot = (config: DeployConfigItem, remotePath: string, rootPath: string) => {
	if (!Array.isArray(config.distPath)) {
		config.distPath = config.distPath?.split(",")
	}
	let len = config.distPath?.length || 0

	// 只有一个目录则上传该目录下文件，不包含目录
	let up_to_root = false
	if (len == 1 && config.distPath && config.upload_to_root) {
		up_to_root = true

		let new_path = path.posix.join(config.type !== "ftp" ? config.remotePath : "/", config.distPath[0])
		if (remotePath.indexOf(new_path) != -1) {
			remotePath = path.posix.join(
				config.type !== "ftp" ? config.remotePath : "/",
				path.relative(new_path, remotePath)
			)
		} else {
			remotePath = path.posix.join(
				config.type !== "ftp" ? config.remotePath : "/",
				remotePath
			)
		}
	}
	return { up_to_root, remotePath }
}


/**
 * 防抖函数，通过延迟执行函数，避免函数在短时间内被频繁调用。
 * @param fn 需要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @param immediate 是否立即执行第一次调用，默认为 false，即延迟执行
 * @returns 返回一个新的函数，该函数在延迟时间内多次调用时，只会在最后一次调用延迟时间结束后执行一次
 */
export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delay: number,
	immediate: boolean = false
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout> | null;

	return function (...args: Parameters<T>) {
		if (timer) clearTimeout(timer);

		if (immediate && !timer) {
			fn(...args); // 立即执行
		}

		timer = setTimeout(() => {
			if (!immediate) fn(...args); // 延迟执行
			timer = null; // 清除计时器
		}, delay);
	};
}


/**
 * 节流函数，用于限制函数的执行频率
 * @param func 需要被节流的函数
 * @param wait 节流时间间隔，单位毫秒
 * @returns 返回一个新的函数，该函数会在指定的时间间隔内最多只执行一次原函数
 */
export function throttle<T extends (...args: any[]) => any>(func: T, wait: number) {
	let timeout: NodeJS.Timeout | null = null;
	let lastCall = 0;

	return function (this: any, ...args: Parameters<T>) {
		const now = Date.now();

		if (lastCall + wait <= now) {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			lastCall = now;
			func.apply(this, args);
		} else if (!timeout) {
			timeout = setTimeout(() => {
				lastCall = Date.now();
				timeout = null;
				func.apply(this, args);
			}, wait - (now - lastCall));
		}
	};
}


function isSubPath(parentPath: string, childPath: string) {
	const parentSegments = parentPath.split('/');
	const childSegments = childPath.split('/');

	// 如果父路径的节点数比子路径多，则不可能是子路径
	if (parentSegments.length > childSegments.length) {
		return false;
	}

	// 逐个节点匹配
	for (let i = 0; i < parentSegments.length; i++) {
		if (parentSegments[i] !== childSegments[i]) {
			return false;
		}
	}
	return true;
}

// 格式化文件大小
export function formatFileSize(bytes: number) {
	if (bytes === 0) return '0 B'; // 如果大小为 0，直接返回
	const units = ['B', 'KB', 'MB', 'GB', 'TB']; // 定义单位
	const k = 1024;
	const i = Math.floor(Math.log(bytes) / Math.log(k)); // 计算单位索引
	const fileSize = (bytes / Math.pow(k, i)).toFixed(2); // 计算文件大小并保留两位小数
	return `${fileSize} ${units[i]}`; // 返回带有单位的结果
}

// 获取使用时间
export function getUseTime(date: string | undefined) {
	if (!date) return ''
	// 获取毫秒数差值
	const diffInMilliseconds = new Date().getTime() - dayjs(date).valueOf();
	// 将毫秒数转换为秒数
	const diffInSeconds = diffInMilliseconds / 1000;

	let useTime = '';
	// 判断秒数是否大于 60
	if (diffInSeconds >= 60) {
		// 秒数大于 60，转换为分钟输出，并保留两位小数
		const diffInMinutes = (diffInSeconds / 60).toFixed(2);
		useTime = `${diffInMinutes} m`;
	} else {
		// 秒数小于 60，直接输出秒数，并保留两位小数
		useTime = `${diffInSeconds.toFixed(2)} s`
	}
	return useTime
}

//转换路径
export function splitPath(path: string) {
	const parts = path.split('/').filter(Boolean); // 去除空字符串部分
	const result = ['/']; // 初始化包含根路径

	parts.reduce((accumulatedPath, currentPart) => {
		const newPath = accumulatedPath + '/' + currentPart;
		result.push(newPath);
		return newPath;
	}, '');

	return result;
}

// 获取上一级路径的辅助函数
export function getParentPath(filepath: string) {
	const segments = filepath.split('/').filter(Boolean); // 去除空字符串部分
	segments.pop(); // 去掉最后一节
	return '/' + segments.join('/'); // 拼接上一级路径并确保前面有一个斜杠
}

// 对文件数组进行排序
export interface FileItem {
  name: string
  isDirectory: boolean
  file?: FileItem
}

export function sortFiles(filesArr: FileItem[], isNested?: boolean): FileItem[]
export function sortFiles(filesArr: any[], isNested?: boolean): any[]
export function sortFiles(filesArr: any[], isNested: boolean = false): any[] {
	return filesArr.sort((a, b) => {
		// 确定是否需要访问嵌套对象中的 isDirectory 属性
		const aDir = isNested ? a.file?.isDirectory ?? false : a.isDirectory;
		const bDir = isNested ? b.file?.isDirectory ?? false : b.isDirectory;

		// 首先比较是否是目录，目录排在前面
		if (aDir && !bDir) {
			return -1; // a 在前
		}
		if (!aDir && bDir) {
			return 1; // b 在前
		}
		// 如果都是目录或者都不是，则按 compare_key 排序
		const aKey = isNested ? a.file?.name ?? '' : a.name;
		const bKey = isNested ? b.file?.name ?? '' : b.name;
		return aKey.localeCompare(bKey);
	});
}

/**
 * 检查Linux文件或目录权限是否在有效的000-777范围内
 * @param {string|number} permissions - 权限值
 * @returns {boolean} 是否为有效权限
 */
export function isValidLinuxPermission(permissions: string | number) {
	// 将权限转换为字符串，并确保格式是三位数字
	const strPermissions = String(permissions);
	const regex = /^[0-7]{3}$/;

	// 正则表达式确保权限格式，并且权限在000到777的范围内
	return regex.test(strPermissions) && Number(strPermissions) <= 777;
}


export function permissionsToOctal(permissions: Permissions): string {
	// 定义每个权限字符对应的数字
	const permMap: { [key: string]: number } = { 'r': 4, 'w': 2, 'x': 1 };

	// 计算每类权限的八进制值
	function calcPermValue(permStr: string): number {
		return [...permStr].reduce((sum, char) => sum + (permMap[char] || 0), 0);
	}

	// 分别计算 user, group 和 other 的权限值
	const userPerm = calcPermValue(permissions.user || '');
	const groupPerm = calcPermValue(permissions.group || '');
	const otherPerm = calcPermValue(permissions.other || '');

	// 返回八进制表示的权限
	return `${userPerm}${groupPerm}${otherPerm}`;
}

export const getNormalPath = (remotePath: string) => {
	// 使用正则表达式匹配 Windows 盘符（如 C:\）并移除它
	// const normalizedPath = remotePath.replace(/^[A-Za-z]:\\/, "")
	// 使用 Node.js 的 path 模块来进一步处理路径（如果需要）
	// 例如，可以转换为正斜杠（Linux/Unix 风格）
	return path.posix.normalize(remotePath).replace(/\\/g, "/")
}

/**
 * 計算 POSIX 風格的相對路徑（將 Windows 反斜線轉為正斜線）
 * @param from 來源路徑
 * @param to 目標路徑
 * @returns POSIX 風格的相對路徑
 */
export function posixRelative(from: string, to: string): string {
	return path.relative(from, to).split(path.sep).join('/')
}

// 生成随机密码字符串的函数
export function generateRandomPassword(length: number) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}
