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
	workspace: {
		workspaceFolders: [] as { uri: { fsPath: string } }[],
		getConfiguration: () => ({
			get: (key: string, defaultValue?: any) => Object.prototype.hasOwnProperty.call(configurationValues, key)
				? configurationValues[key]
				: defaultValue
		}),
		openTextDocument: async (fileName: string) => ({ fileName })
	},
	window: {
		createOutputChannel: () => ({
			show: () => undefined,
			clear: () => undefined,
			appendLine: () => undefined,
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

export function resetVscodeMock(workspaceRoot?: string) {
	vscodeMock.workspace.workspaceFolders = workspaceRoot ? [{ uri: { fsPath: workspaceRoot } }] : [];
	workspaceStateValues.clear();
}

export function setConfigurationValue(key: string, value: any) {
	configurationValues[key] = value;
}
