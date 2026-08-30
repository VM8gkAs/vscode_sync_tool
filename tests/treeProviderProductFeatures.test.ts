import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	installVscodeMock,
	resetVscodeMock,
	setConfigurationValue,
	vscodeMock,
	vscodeMockExtensionContext
} from './setup/vscodeMock';

installVscodeMock();

describe('Tree provider P3 product features', () => {
	let tree: typeof import('../src/treeProvider');
	let FileTransfer: any;
	let originalAddTask: any;
	let originalInformationMessage: any;
	let originalErrorMessage: any;
	let originalExecuteCommand: any;
	let fixtureRoot = '';

	before(() => {
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
		tree = require('../src/treeProvider');
		FileTransfer = require('../src/FileTransfer').default;
		originalAddTask = FileTransfer.addTask;
		originalInformationMessage = vscodeMock.window.showInformationMessage;
		originalErrorMessage = vscodeMock.window.showErrorMessage;
		originalExecuteCommand = vscodeMock.commands.executeCommand;
	});

	beforeEach(() => {
		fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-tree-p3-'));
		resetVscodeMock();
		setConfigurationValue('confirmMoveOrUpload', true);
		setConfigurationValue('logToFile', false);
	});

	afterEach(() => {
		FileTransfer.addTask = originalAddTask;
		vscodeMock.window.showInformationMessage = originalInformationMessage;
		vscodeMock.window.showErrorMessage = originalErrorMessage;
		vscodeMock.commands.executeCommand = originalExecuteCommand;
		fs.rmSync(fixtureRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	function createConfig(workspaceRoot = 'C:\\workspace') {
		return {
			name: 'main',
			type: 'ssh',
			host: 'example.com',
			port: 22,
			username: 'user',
			password: 'pw',
			remotePath: '/remote',
			workspaceRoot
		} as any;
	}

	function createToken(cancelled = false) {
		return { isCancellationRequested: cancelled } as any;
	}

	it('cancels a confirmed local drop before queuing uploads', async () => {
		const localPath = path.join(fixtureRoot, 'file.txt');
		fs.writeFileSync(localPath, 'local');
		const provider = new tree.DepNodeProvider();
		const target = new tree.Dependency(createConfig(), 2, '', '', 0);
		const tasks: any[] = [];
		FileTransfer.addTask = async (task: any) => tasks.push(task);
		vscodeMock.window.showInformationMessage = async () => 'Cancel';
		const source = { get: (type: string) => type === 'text/uri-list' ? { value: localPath } : undefined } as any;

		await provider.handleDrop(target, source, createToken());

		assert.deepStrictEqual(tasks, []);
	});

	it('queues a local drop with a POSIX remote path when confirmation is disabled', async () => {
		const localPath = path.join(fixtureRoot, 'file.txt');
		fs.writeFileSync(localPath, 'local');
		const provider = new tree.DepNodeProvider();
		const target = new tree.Dependency(createConfig(), 2, '', '', 0);
		const tasks: any[] = [];
		setConfigurationValue('confirmMoveOrUpload', false);
		FileTransfer.addTask = async (task: any) => tasks.push(task);
		const source = { get: (type: string) => type === 'text/uri-list' ? { value: localPath } : undefined } as any;

		await provider.handleDrop(target, source, createToken());

		assert.strictEqual(tasks.length, 1);
		assert.strictEqual(tasks[0].remotePath, '/remote/file.txt');
	});

	it('does not acquire a client when a remote move confirmation is cancelled', async () => {
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const sourceNode = new tree.RepositoryFileNode({ name: 'file.txt', isDirectory: false, size: 1 }, root, '/remote');
		const target = new tree.RepositoryFileNode({ name: 'dest', isDirectory: true, size: 0 }, root, '/remote');
		let clientRequests = 0;
		(provider as any).getClient = async () => {
			clientRequests++;
			return {};
		};
		vscodeMock.window.showInformationMessage = async () => 'Cancel';
		const source = { get: (type: string) => type.includes('asyncToolsView') ? { value: [sourceNode] } : undefined } as any;

		await provider.handleDrop(target, source, createToken());

		assert.strictEqual(clientRequests, 0);
	});

	it('rejects remote moves between same-name configs in different workspaces', async () => {
		const provider = new tree.DepNodeProvider();
		const sourceRoot = new tree.Dependency(createConfig('C:\\one'), 2, '', '', 0);
		const targetRoot = new tree.Dependency(createConfig('C:\\two'), 2, '', '', 0);
		const sourceNode = new tree.RepositoryFileNode({ name: 'file.txt', isDirectory: false, size: 1 }, sourceRoot, '/remote');
		let clientRequests = 0;
		(provider as any).getClient = async () => {
			clientRequests++;
			return {};
		};
		const errors: string[] = [];
		vscodeMock.window.showErrorMessage = async (message: string) => errors.push(message);
		const source = { get: (type: string) => type.includes('asyncToolsView') ? { value: [sourceNode] } : undefined } as any;

		await provider.handleDrop(targetRoot, source, createToken());

		assert.strictEqual(clientRequests, 0);
		assert.match(errors[0], /same connection/);
	});

	it('does not overwrite an existing remote move target and releases the client once', async () => {
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const sourceNode = new tree.RepositoryFileNode({ name: 'file.txt', isDirectory: false, size: 1 }, root, '/remote');
		const target = new tree.RepositoryFileNode({ name: 'dest', isDirectory: true, size: 0 }, root, '/remote');
		let renameCalls = 0;
		let releaseCalls = 0;
		setConfigurationValue('confirmMoveOrUpload', false);
		const client = {
			fastGet: async () => '',
			exists: async () => '-',
			rename: async () => { renameCalls++; }
		};
		(provider as any).getClient = async () => ({
			client,
			fileTransfer: { releaseClient: async () => { releaseCalls++; } }
		});
		const source = { get: (type: string) => type.includes('asyncToolsView') ? { value: [sourceNode] } : undefined } as any;

		await provider.handleDrop(target, source, createToken());

		assert.strictEqual(renameCalls, 0);
		assert.strictEqual(releaseCalls, 1);
	});

	it('rejects moving a remote folder into its own subtree before acquiring a client', async () => {
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const sourceNode = new tree.RepositoryFileNode({ name: 'source', isDirectory: true, size: 0 }, root, '/remote');
		const target = new tree.RepositoryFileNode({ name: 'child', isDirectory: true, size: 0 }, sourceNode, '/remote/source');
		let clientRequests = 0;
		const errors: string[] = [];
		setConfigurationValue('confirmMoveOrUpload', false);
		(provider as any).getClient = async () => {
			clientRequests++;
			return {};
		};
		vscodeMock.window.showErrorMessage = async (message: string) => errors.push(message);
		const source = { get: (type: string) => type.includes('asyncToolsView') ? { value: [sourceNode] } : undefined } as any;

		await provider.handleDrop(target, source, createToken());

		assert.strictEqual(clientRequests, 0);
		assert.match(errors[0], /cannot be moved into itself/);
	});

	it('marks only SSH ZIP files with the remote extraction context', () => {
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const zip = new tree.RepositoryFileNode({ name: 'release.ZIP', isDirectory: false, size: 1 }, root, '/remote');
		const text = new tree.RepositoryFileNode({ name: 'readme.txt', isDirectory: false, size: 1 }, root, '/remote');

		assert.strictEqual(zip.contextValue, 'sync_file_ssh_zip');
		assert.strictEqual(text.contextValue, 'sync_file_ssh');
	});

	it('extracts a confirmed remote ZIP into its parent and releases the client', async () => {
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const zip = new tree.RepositoryFileNode({ name: 'release.zip', isDirectory: false, size: 1 }, root, '/remote');
		let extracted: string[] = [];
		let releaseCalls = 0;
		let refreshCalls = 0;
		vscodeMock.window.showInformationMessage = async () => 'Confirm';
		(provider as any).getClient = async () => ({
			client: { fastGet: async () => '' },
			fileTransfer: {
				unzipRemoteFile: async (_client: any, archive: string, destination: string) => {
					extracted = [archive, destination];
				},
				releaseClient: async () => { releaseCalls++; }
			}
		});
		(provider as any).refreshEntry = async () => { refreshCalls++; };

		await provider.extractRemoteArchive(zip);

		assert.deepStrictEqual(extracted, ['/remote/release.zip', '/remote']);
		assert.strictEqual(releaseCalls, 1);
		assert.strictEqual(refreshCalls, 1);
	});

	it('restores the scoped Tree status when synchronization completes', async () => {
		const provider = new tree.DepNodeProvider();
		const first = new tree.Dependency(createConfig('C:\\one'), 2, '', '', 0);
		const second = new tree.Dependency(createConfig('C:\\two'), 2, '', '', 0);
		first.isRun = true;
		second.isRun = true;
		first.contextValue = 'tools_sync';
		second.contextValue = 'tools_sync';
		(provider as any).items = [first, second];

		await provider.updateSyncStatus('main', 'complete_sync', 'C:\\one');

		assert.strictEqual(first.contextValue, 'tools_connect');
		assert.strictEqual(second.contextValue, 'tools_sync');
	});

	it('opens file diffs with local on the left and remote on the right', async () => {
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const node = new tree.RepositoryFileNode({ name: 'file.txt', isDirectory: false, size: 1 }, root, '/remote');
		const localPath = path.join(fixtureRoot, 'local.txt');
		const remotePath = path.join(fixtureRoot, 'remote.txt');
		fs.writeFileSync(localPath, 'local');
		fs.writeFileSync(remotePath, 'remote');
		let commandArgs: any[] = [];
		vscodeMock.commands.executeCommand = async (...args: any[]) => { commandArgs = args; };

		await provider.showRemoteFile(remotePath, localPath, { fsPath: 'virtual' } as any, node);

		assert.strictEqual(commandArgs[0], 'vscode.diff');
		assert.strictEqual(commandArgs[1].fsPath, localPath);
		assert.strictEqual(commandArgs[2].fsPath, remotePath);
		assert.match(commandArgs[3], /Local file.*Remote file/);
	});

	it('rejects directory comparisons before opening a connection', async () => {
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(createConfig(), 2, '', '', 0);
		const directory = new tree.RepositoryFileNode({ name: 'folder', isDirectory: true, size: 0 }, root, '/remote');
		let clientRequests = 0;
		const errors: string[] = [];
		(provider as any).getClient = async () => {
			clientRequests++;
			return {};
		};
		vscodeMock.window.showErrorMessage = async (message: string) => errors.push(message);

		await provider.compareFile(directory);

		assert.strictEqual(clientRequests, 0);
		assert.match(errors[0], /Only files can be compared/);
	});

	it('downloads a fresh remote copy instead of reusing cache for comparison', async () => {
		const { CACHE_DIRNAME } = require('../src/config/config');
		const { getConfigCacheDirectoryName } = require('../src/utils');
		const config = createConfig(fixtureRoot);
		const provider = new tree.DepNodeProvider();
		const root = new tree.Dependency(config, 2, '', '', 0);
		const node = new tree.RepositoryFileNode({ name: 'file.txt', isDirectory: false, size: 1 }, root, '/remote');
		const localPath = path.join(fixtureRoot, 'file.txt');
		const cachedRemotePath = path.join(
			os.tmpdir(),
			CACHE_DIRNAME,
			getConfigCacheDirectoryName(config),
			'file.txt'
		);
		fs.mkdirSync(path.dirname(cachedRemotePath), { recursive: true });
		fs.writeFileSync(cachedRemotePath, 'stale');
		fs.writeFileSync(localPath, 'local');
		let downloadCalls = 0;
		const client = {
			fastGet: async (_remote: string, targetPath: string, options: any) => {
				downloadCalls++;
				fs.writeFileSync(targetPath, 'fresh');
				await options.step(1, 1, 1);
				return targetPath;
			}
		};
		(provider as any).getClient = async () => ({ client });
		(provider as any).releaseClient = async () => undefined;
		(provider as any).showRemoteFile = async () => undefined;

		await (provider as any).openResource(node, localPath);

		assert.strictEqual(downloadCalls, 1);
		assert.strictEqual(fs.readFileSync(cachedRemotePath, 'utf8'), 'fresh');
	});
});
