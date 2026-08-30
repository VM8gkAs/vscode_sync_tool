import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	installVscodeMock,
	resetVscodeMock,
	setConfigurationValue,
	vscodeMock,
	vscodeMockOutput,
	vscodeMockExtensionContext
} from './setup/vscodeMock';
import { ClientConnectionError } from '../src/types/connect';

installVscodeMock();

describe('FileTransfer queue finalization', () => {
	let FileTransfer: any;
	let output: typeof import('../src/output');
	let workspaceRoot = '';

	before(() => {
		FileTransfer = require('../src/FileTransfer').default;
		output = require('../src/output');
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
	});

	beforeEach(() => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-finalize-'));
		resetVscodeMock(workspaceRoot);
		setConfigurationValue('logToFile', false);
		setConfigurationValue('logDirectory', 'sync_logs');
		output.cleanLogTask(true);
		FileTransfer.taskMaxRetries = 3;
		FileTransfer.taskRetryDelayMs = 0;
	});

	afterEach(async () => {
		if (FileTransfer.timer) {
			clearInterval(FileTransfer.timer);
			FileTransfer.timer = null;
		}
		FileTransfer.ftpConnectionPools = {};
		FileTransfer.sftpConnectionPools = {};
		FileTransfer.queues = {};
		FileTransfer.maxConnectionsMap = {};
		FileTransfer.concurrencyProbeInFlight = {};
		FileTransfer.concurrencyProbeLastStartedAt = {};
		FileTransfer.queueConfigs = {};
		FileTransfer.queueOwners = {};
		FileTransfer.queueTerminalStates = {};
		FileTransfer.finalizedQueues = new Set();
		FileTransfer.connectionLimiters = new Map();
		FileTransfer.clientLeaseReleases = new WeakMap();
		output.cleanLogTask(true);
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	function createConfig() {
		return {
			name: 'main',
			type: 'sftp',
			host: 'example.com',
			port: 22,
			username: 'user',
			password: 'pw',
			remotePath: '/remote',
			workspaceRoot,
			watch: true,
			skipIfSame: false
		};
	}

	function scopeKey(config: { name: string; workspaceRoot: string }) {
		return `${config.workspaceRoot}###${config.name}`;
	}

	async function waitForFinalization(config: { name: string; workspaceRoot: string }) {
		const key = scopeKey(config);
		for (let i = 0; i < 100; i++) {
			if (FileTransfer.finalizedQueues.has(key)) return;
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		throw new Error(`queue did not finalize: ${key}`);
	}

	function stubSuccessfulTransfer(transfer: any) {
		transfer.getClient = async () => ({});
		transfer.releaseClient = async () => undefined;
		transfer.uploadFile = async () => undefined;
		transfer.addMaxConcurrency = async () => undefined;
	}

	it('finalizes a successful drain once and clears the watch cache', async () => {
		const config = createConfig();
		const localPath = path.join(workspaceRoot, 'file.txt');
		fs.writeFileSync(localPath, 'upload');
		const transfer = new FileTransfer(config);
		stubSuccessfulTransfer(transfer);
		const cacheKey = `${config.name}###${workspaceRoot}`;
		await vscodeMockExtensionContext.workspaceState.update(cacheKey, { pending: true });

		await FileTransfer.addTask({
			config,
			localPath,
			remotePath: '/remote/file.txt',
			operationType: 'upload'
		});
		await waitForFinalization(config);

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'completed');
		assert.strictEqual(vscodeMockExtensionContext.workspaceState.get(cacheKey), '');
		await transfer.finalizeQueue(config, 'failed');
		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'completed');
	});

	it('still records the terminal state when watch cache cleanup fails', async () => {
		const config = createConfig();
		const transfer = new FileTransfer(config);
		transfer.clearCache = async () => {
			throw new Error('cache cleanup failed');
		};

		await transfer.finalizeQueue(config, 'failed');

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'failed');
		assert.strictEqual(FileTransfer.finalizedQueues.has(scopeKey(config)), true);
		await transfer.finalizeQueue(config, 'completed');
		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'failed');
	});

	it('publishes the terminal state to the status bar and UI event', async () => {
		const config = createConfig();
		const transfer = new FileTransfer(config);
		const { myEvent } = require('../src/events/myEvent');
		const { StatusBarUi } = require('../src/statusBar');
		let terminalEvent: any;
		const subscription = myEvent.event((event: any) => {
			if (event?.type === 'refreshSyncStatus') terminalEvent = event;
		});

		await transfer.finalizeQueue(config, 'failed');

		assert.strictEqual(terminalEvent.terminalState, 'failed');
		assert.strictEqual(terminalEvent.workspaceRoot, workspaceRoot);
		assert.match((StatusBarUi as any)._statusBarItem.text, /failed/);
		subscription.dispose();
	});

	it('opens Explorer comparisons with local on the left and remote on the right', async () => {
		const config = createConfig();
		config.watch = false;
		const transfer = new FileTransfer(config);
		const localSourcePath = path.join(workspaceRoot, 'file.txt');
		const remoteCopyPath = path.join(workspaceRoot, '.remote', 'file.txt');
		fs.writeFileSync(localSourcePath, 'local');
		transfer.getClient = async () => ({});
		transfer.releaseClient = async () => undefined;
		transfer.downloadFile = async () => {
			fs.mkdirSync(path.dirname(remoteCopyPath), { recursive: true });
			fs.writeFileSync(remoteCopyPath, 'remote');
		};
		transfer.addMaxConcurrency = async () => undefined;
		const originalExecuteCommand = vscodeMock.commands.executeCommand;
		let commandArgs: any[] = [];
		vscodeMock.commands.executeCommand = async (...args: any[]) => { commandArgs = args; };

		try {
			await FileTransfer.addTask({
				config,
				localPath: remoteCopyPath,
				remotePath: '/remote/file.txt',
				operationType: 'download',
				compare: true,
				isDirectory: false
			});
			await waitForFinalization(config);

			assert.strictEqual(commandArgs[0], 'vscode.diff');
			assert.strictEqual(commandArgs[1].fsPath, localSourcePath);
			assert.strictEqual(commandArgs[2].fsPath, remoteCopyPath);
		} finally {
			vscodeMock.commands.executeCommand = originalExecuteCommand;
		}
	});

	it('uses the latest scoped config when a queue drain finalizes', async () => {
		const config = createConfig();
		config.watch = false;
		const transfer = new FileTransfer(config);
		stubSuccessfulTransfer(transfer);
		const latestConfig = {
			...config,
			watch: true,
			downloadExcludePath: 'latest-only'
		};
		let clearedConfig: any;
		transfer.clearCache = async (receivedConfig: any) => {
			clearedConfig = receivedConfig;
		};
		FileTransfer.queueConfigs[scopeKey(config)] = latestConfig;

		await FileTransfer.addTask({
			config,
			localPath: path.join(workspaceRoot, 'latest.txt'),
			remotePath: '/remote/latest.txt',
			operationType: 'upload'
		});
		await waitForFinalization(config);

		assert.strictEqual(clearedConfig, latestConfig);
	});

	it('retains completed output until the user explicitly clears it', async () => {
		const config = createConfig();
		config.watch = false;
		const transfer = new FileTransfer(config);
		output.addLogTask('[retained-after-finalize]', config);
		output.updateProgress(true);

		await transfer.finalizeQueue(config, 'completed');
		output.updateProgress(true);

		assert.match(vscodeMockOutput.value, /retained-after-finalize/);
		output.cleanLogTask(true);
		assert.strictEqual(vscodeMockOutput.value, '');
	});

	it('finalizes the skip path through queue drain', async () => {
		const config = createConfig();
		config.skipIfSame = true;
		const localPath = path.join(workspaceRoot, 'same.txt');
		fs.writeFileSync(localPath, 'same');
		const transfer = new FileTransfer(config);
		stubSuccessfulTransfer(transfer);
		transfer.shouldSkipUpload = async () => true;

		await FileTransfer.addTask({
			config,
			localPath,
			remotePath: '/remote/same.txt',
			operationType: 'upload'
		});
		await waitForFinalization(config);

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'completed');
	});

	it('skips an obsolete upload before opening a connection or mutating the remote path', async () => {
		const config = createConfig();
		const transfer = new FileTransfer(config);
		let connectionAttempts = 0;
		let uploadAttempts = 0;
		transfer.getClient = async () => {
			connectionAttempts++;
			return {};
		};
		transfer.uploadFile = async () => {
			uploadAttempts++;
		};
		const task: any = {
			config,
			localPath: path.join(workspaceRoot, 'renamed-away', 'file.txt'),
			remotePath: '/remote/renamed-away/file.txt',
			operationType: 'upload'
		};

		await FileTransfer.addTask(task);
		await waitForFinalization(config);

		assert.strictEqual(connectionAttempts, 0);
		assert.strictEqual(uploadAttempts, 0);
		assert.strictEqual(task.retries, undefined);
		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'completed');
	});

	it('does not create a remote parent when the local path disappears before transfer', async () => {
		const config = createConfig();
		const transfer = new FileTransfer(config);
		let remoteFolderChecks = 0;
		transfer.checkExistFolder = async () => {
			remoteFolderChecks++;
		};

		await transfer.uploadFile({}, {
			config,
			localPath: path.join(workspaceRoot, 'renamed-away', 'file.txt'),
			remotePath: '/remote/renamed-away/file.txt',
			operationType: 'upload'
		});

		assert.strictEqual(remoteFolderChecks, 0);
	});

	it('finalizes retry exhaustion as failed and preserves the task error', async () => {
		const config = createConfig();
		const localPath = path.join(workspaceRoot, 'file.txt');
		fs.writeFileSync(localPath, 'retry');
		const transfer = new FileTransfer(config);
		stubSuccessfulTransfer(transfer);
		transfer.uploadFile = async () => {
			throw new Error('upload exploded');
		};
		const task: any = {
			config,
			localPath,
			remotePath: '/remote/file.txt',
			operationType: 'upload'
		};

		await FileTransfer.addTask(task);
		await waitForFinalization(config);

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'failed');
		assert.match(task.error, /upload exploded/);
	});

	it('finalizes connection errors as failed', async () => {
		const config = createConfig();
		const localPath = path.join(workspaceRoot, 'file.txt');
		fs.writeFileSync(localPath, 'connect');
		const transfer = new FileTransfer(config);
		transfer.getClient = async () => {
			throw new ClientConnectionError('connection refused');
		};
		transfer.releaseClient = async () => undefined;
		const task: any = {
			config,
			localPath,
			remotePath: '/remote/file.txt',
			operationType: 'upload'
		};

		await FileTransfer.addTask(task);
		await waitForFinalization(config);

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'failed');
		assert.match(task.error, /connection refused/);
	});

	it('does not release the same client twice when a retry cannot reconnect', async () => {
		const config = createConfig();
		const localPath = path.join(workspaceRoot, 'retry.txt');
		fs.writeFileSync(localPath, 'retry');
		const transfer = new FileTransfer(config);
		const client = {};
		let connectionAttempts = 0;
		let releaseCalls = 0;
		transfer.getClient = async () => {
			connectionAttempts++;
			if (connectionAttempts === 1) return client;
			throw new ClientConnectionError('retry connection refused');
		};
		transfer.releaseClient = async (releasedClient: unknown) => {
			assert.strictEqual(releasedClient, client);
			releaseCalls++;
		};
		transfer.uploadFile = async () => {
			throw new Error('first upload failed');
		};
		transfer.addMaxConcurrency = async () => undefined;
		const task: any = {
			config,
			localPath,
			remotePath: '/remote/retry.txt',
			operationType: 'upload'
		};

		await FileTransfer.addTask(task);
		await waitForFinalization(config);

		assert.strictEqual(connectionAttempts, 2);
		assert.strictEqual(releaseCalls, 1);
		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'failed');
	});

	it('finalizes an empty deployment instead of leaving the UI busy', async () => {
		const config = createConfig();
		config.watch = false;
		const Deploy = require('../src/deploy').Deploy;
		const deploy = new Deploy({ config });
		deploy.taskList = [];

		await deploy.start();

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'completed');
		assert.strictEqual(FileTransfer.finalizedQueues.has(scopeKey(config)), true);
	});

	it('finalizes a cancelled deployment without overwriting it as failed', async () => {
		const config = createConfig();
		const Deploy = require('../src/deploy').Deploy;
		const deploy = new Deploy({ config });
		deploy.taskList = [];
		deploy.cancel();

		await assert.rejects(deploy.start(), /Task canceled/);

		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(config)], 'cancelled');
		assert.strictEqual(FileTransfer.finalizedQueues.has(scopeKey(config)), true);
	});

	it('finalizes explicit stop and cancellation states', async () => {
		const stoppedConfig = createConfig();
		new FileTransfer(stoppedConfig);
		await FileTransfer.changeAsyncStatus(stoppedConfig, 'stop', 'stopped');
		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(stoppedConfig)], 'stopped');

		const cancelledConfig = { ...createConfig(), name: 'cancelled' };
		new FileTransfer(cancelledConfig);
		await FileTransfer.changeAsyncStatus(cancelledConfig, 'stop', 'cancelled');
		assert.strictEqual(FileTransfer.queueTerminalStates[scopeKey(cancelledConfig)], 'cancelled');
	});
});
