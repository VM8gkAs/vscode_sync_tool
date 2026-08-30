import path from 'path';

type LoadedModule = (...args: any[]) => any;

const Module = require('module') as { _load: LoadedModule };
let originalLoad: LoadedModule | undefined;

const configurationValues: Record<string, any> = {
	uploadTaskNumber: 10,
	uploadConcurrentLimit: 3,
	logShow: false,
	gitignore: false,
	excludePath: []
};

const workspaceStateValues = new Map<string, any>();

export const vscodeMockOutput = {
	value: '',
	clearCount: 0
};

export const vscodeMockExtensionContext: any = {
	workspaceState: {
		get: (key: string) => workspaceStateValues.get(key),
		update: async (key: string, value: any) => {
			workspaceStateValues.set(key, value);
		}
	}
};

export const vscodeMock: any = {
	StatusBarAlignment: {
		Left: 1
	},
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3
	},
	workspace: {
		isTrusted: true,
		workspaceFolders: [] as { uri: { fsPath: string } }[],
		textDocuments: [] as any[],
		getWorkspaceFolder: (uri: { fsPath: string }) => {
			return vscodeMock.workspace.workspaceFolders.find((folder: { uri: { fsPath: string } }) => {
				const relative = path.relative(folder.uri.fsPath, uri.fsPath);
				return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
			});
		},
		getConfiguration: () => ({
			get: (key: string, defaultValue?: any) => Object.prototype.hasOwnProperty.call(configurationValues, key)
				? configurationValues[key]
				: defaultValue,
			update: async (key: string, value: any) => {
				configurationValues[key] = value;
			}
		}),
		openTextDocument: async (fileName: string) => ({ fileName })
	},
	window: {
		createOutputChannel: () => ({
			show: () => undefined,
			clear: () => {
				vscodeMockOutput.value = '';
				vscodeMockOutput.clearCount++;
			},
			appendLine: (line: string) => {
				vscodeMockOutput.value += `${line}\n`;
			},
			dispose: () => undefined
		}),
		createStatusBarItem: () => ({
			show: () => undefined,
			hide: () => undefined,
			dispose: () => undefined,
			text: '',
			tooltip: '',
			color: undefined as string | undefined,
			command: undefined as string | undefined
		}),
		showErrorMessage: async (message: string) => message,
		showInformationMessage: async (message: string) => message,
		showWarningMessage: async (message: string) => message,
		showInputBox: async () => '',
		showQuickPick: async () => undefined,
		showOpenDialog: async () => undefined,
		showTextDocument: async (document: any) => document
	},
	commands: {
		executeCommand: async () => undefined,
		registerCommand: () => ({ dispose: () => undefined })
	},
	languages: {
		registerCodeLensProvider: () => ({ dispose: () => undefined })
	},
	l10n: {
		t: (message: string, ...args: any[]) => message.replace(/\{(\d+)\}/g, (_match, index) => `${args[Number(index)] ?? ''}`)
	},
	EventEmitter: class MockEventEmitter<T> {
		private listeners: ((value: T) => void)[] = [];
		event = (listener: (value: T) => void) => {
			this.listeners.push(listener);
			return { dispose: () => undefined };
		};
		fire(value: T) {
			this.listeners.forEach(listener => listener(value));
		}
	},
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2
	},
	TreeItem: class MockTreeItem {
		label: string;
		collapsibleState: number;
		constructor(label: string, collapsibleState: number = 0) {
			this.label = label;
			this.collapsibleState = collapsibleState;
		}
	},
	ThemeIcon: class MockThemeIcon {
		static File = new (class { id = 'file'; })();
		static Folder = new (class { id = 'folder'; })();
		constructor(public id: string) {}
	},
	Uri: {
		file: (fsPath: string) => ({ fsPath, path: fsPath }),
		parse: (value: string) => ({ fsPath: value, path: value })
	},
	Range: class MockRange {
		constructor(public start: any, public end: any) {}
	},
	CodeLens: class MockCodeLens {
		constructor(public range: any, public command?: any) {}
	}
};

export function installVscodeMock() {
	if (originalLoad) {
		return;
	}

	originalLoad = Module._load;
	Module._load = function load(request: string, parent: NodeModule | null, isMain: boolean) {
		if (request === 'vscode') {
			return vscodeMock;
		}
		if (request === 'basic-ftp-proxy') {
			return {
				Client: class MockFtpClient {},
				enterPassiveModeIPv4: () => undefined
			};
		}
		if (request === 'basic-ftp-proxy/dist/proxySocket') {
			return {
				create: () => ({})
			};
		}
		if (request.endsWith('lib/ssh2-sftp-client/index') || request === './lib/ssh2-sftp-client/index') {
			return class MockSftpClient {};
		}
		return originalLoad ? originalLoad(request, parent, isMain) : undefined;
	};
}

export function resetVscodeMock(workspaceRoot?: string | string[]) {
	const roots = Array.isArray(workspaceRoot) ? workspaceRoot : workspaceRoot ? [workspaceRoot] : [];
	vscodeMock.workspace.workspaceFolders = roots.map(fsPath => ({ uri: { fsPath } }));
	vscodeMock.workspace.isTrusted = true;
	workspaceStateValues.clear();
	vscodeMockOutput.value = '';
	vscodeMockOutput.clearCount = 0;
}

export function setConfigurationValue(key: string, value: any) {
	configurationValues[key] = value;
}
