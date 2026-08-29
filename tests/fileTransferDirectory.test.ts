import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installVscodeMock, resetVscodeMock, vscodeMockExtensionContext } from './setup/vscodeMock';

installVscodeMock();

describe('FileTransfer.checkExistFolder', () => {
	let FileTransfer: any;

	before(() => {
		FileTransfer = require('../src/FileTransfer').default;
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
		resetVscodeMock('C:\\workspace');
	});

	afterEach(() => {
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
		FileTransfer.concurrencyProbeCooldownMs = 2000;
		FileTransfer.ftpFileTimeStrategyCache = {};
		FileTransfer.queueConfigs = {};
		FileTransfer.queueOwners = {};
		FileTransfer.queueTerminalStates = {};
		FileTransfer.finalizedQueues = new Set();
		FileTransfer.connectionLimiters = new Map();
		FileTransfer.clientLeaseReleases = new WeakMap();
		FileTransfer.taskMaxRetries = 3;
		FileTransfer.taskRetryDelayMs = 2000;
	});

	function createConfig(type: 'ftp' | 'sftp') {
		return {
			name: `main-${type}`,
			type,
			host: 'example.com',
			port: type === 'ftp' ? 21 : 22,
			username: 'user',
			password: 'pw',
			remotePath: '/remote',
			workspaceRoot: 'C:\\workspace'
		};
	}

	function getScopeKey(config: { name: string; workspaceRoot: string }) {
		return `${config.workspaceRoot}###${config.name}`;
	}

	it('creates and caches a missing SFTP folder', async () => {
		const config = createConfig('sftp');
		const transfer = new FileTransfer(config);
		let existsCalls = 0;
		const mkdirCalls: any[] = [];
		const client = {
			exists: async () => {
				existsCalls++;
				return false;
			},
			mkdir: async (folder: string, recursive: boolean) => {
				mkdirCalls.push([folder, recursive]);
			}
		};

		await transfer.checkExistFolder(config, client, 'remote/app');
		await transfer.checkExistFolder(config, client, 'remote/app');

		assert.strictEqual(existsCalls, 1);
		assert.deepStrictEqual(mkdirCalls, [['/remote/app', true]]);
	});

	it('does not create an existing SFTP folder', async () => {
		const config = createConfig('sftp');
		const transfer = new FileTransfer(config);
		let existsCalls = 0;
		let mkdirCalls = 0;
		const client = {
			exists: async () => {
				existsCalls++;
				return 'd';
			},
			mkdir: async () => {
				mkdirCalls++;
			}
		};

		await transfer.checkExistFolder(config, client, 'remote/app');
		await transfer.checkExistFolder(config, client, 'remote/app');

		assert.strictEqual(existsCalls, 1);
		assert.strictEqual(mkdirCalls, 0);
	});

	it('creates and caches a missing FTP folder', async () => {
		const config = createConfig('ftp');
		const transfer = new FileTransfer(config);
		let listCalls = 0;
		const ensureDirCalls: string[] = [];
		const client = {
			list: async () => {
				listCalls++;
				return [];
			},
			ensureDir: async (folder: string) => {
				ensureDirCalls.push(folder);
			}
		};

		await transfer.checkExistFolder(config, client, 'remote/app');
		await transfer.checkExistFolder(config, client, 'remote/app');

		assert.strictEqual(listCalls, 1);
		assert.deepStrictEqual(ensureDirCalls, ['/remote/app']);
	});

	it('does not create an existing FTP folder', async () => {
		const config = createConfig('ftp');
		const transfer = new FileTransfer(config);
		let listCalls = 0;
		let ensureDirCalls = 0;
		const client = {
			list: async () => {
				listCalls++;
				return [{ name: 'app' }];
			},
			ensureDir: async () => {
				ensureDirCalls++;
			}
		};

		await transfer.checkExistFolder(config, client, 'remote/app');
		await transfer.checkExistFolder(config, client, 'remote/app');

		assert.strictEqual(listCalls, 1);
		assert.strictEqual(ensureDirCalls, 0);
	});

	it('deduplicates concurrent SFTP checks for the same folder', async () => {
		const config = createConfig('sftp');
		const transfer = new FileTransfer(config);
		let existsCalls = 0;
		let mkdirCalls = 0;
		const client = {
			exists: async () => {
				existsCalls++;
				await new Promise(resolve => setTimeout(resolve, 10));
				return false;
			},
			mkdir: async () => {
				mkdirCalls++;
			}
		};

		await Promise.all([
			transfer.checkExistFolder(config, client, 'remote/app'),
			transfer.checkExistFolder(config, client, 'remote/app')
		]);

		assert.strictEqual(existsCalls, 1);
		assert.strictEqual(mkdirCalls, 1);
	});

	it('reuses an in-flight concurrency probe for the same config', async () => {
		const config = createConfig('sftp');
		const transfer = new FileTransfer(config);
		transfer.uploadTaskNumber = 1;
		transfer.maxConnections = 3;
		FileTransfer.concurrencyProbeCooldownMs = 0;
		const scopeKey = getScopeKey(config);
		FileTransfer.sftpConnectionPools[scopeKey] = [];
		FileTransfer.queues[scopeKey] = {
			length: () => 10,
			running: () => 0,
			concurrency: 1
		};
		let getClientCalls = 0;
		transfer.getClient = async () => {
			getClientCalls++;
			await new Promise(resolve => setTimeout(resolve, 10));
			return { id: getClientCalls };
		};
		transfer.releaseClient = async () => undefined;

		await Promise.all([
			transfer.addMaxConcurrency(config),
			transfer.addMaxConcurrency(config)
		]);

		assert.strictEqual(getClientCalls, 3);
		assert.strictEqual(FileTransfer.queues[scopeKey].concurrency, 2);
	});

	it('rate-limits repeated concurrency probes after a successful probe', async () => {
		const config = createConfig('sftp');
		const transfer = new FileTransfer(config);
		transfer.uploadTaskNumber = 1;
		transfer.maxConnections = 3;
		FileTransfer.concurrencyProbeCooldownMs = 100000;
		const scopeKey = getScopeKey(config);
		FileTransfer.sftpConnectionPools[scopeKey] = [];
		FileTransfer.queues[scopeKey] = {
			length: () => 10,
			running: () => 0,
			concurrency: 1
		};
		let getClientCalls = 0;
		transfer.getClient = async () => {
			getClientCalls++;
			return { id: getClientCalls };
		};
		transfer.releaseClient = async () => undefined;

		await transfer.addMaxConcurrency(config);
		await transfer.addMaxConcurrency(config);

		assert.strictEqual(getClientCalls, 3);
		assert.strictEqual(FileTransfer.queues[scopeKey].concurrency, 2);
	});

	it('caches the successful FTP file-time command strategy', async () => {
		const config = createConfig('ftp');
		const transfer = new FileTransfer(config);
		const task = {
			config,
			localPath: 'C:\\workspace\\app.txt',
			remotePath: '/remote/app.txt',
			isDirectory: false
		};
		const sentCommands: string[] = [];
		const client = {
			send: async (command: string) => {
				sentCommands.push(command);
				if (command.startsWith('MFMT ')) {
					throw new Error('MFMT unsupported');
				}
			}
		};
		const targetTime = new Date('2026-05-26T10:20:30Z');

		await transfer.applyRemoteFileTime(client, task, '/remote/app.txt', targetTime);
		await transfer.applyRemoteFileTime(client, task, '/remote/next.txt', targetTime);

		assert.strictEqual(sentCommands.length, 3);
		assert.ok(sentCommands[0].startsWith('MFMT '));
		assert.ok(sentCommands[1].startsWith('SITE MFMT '));
		assert.ok(sentCommands[2].startsWith('SITE MFMT '));
		assert.ok(sentCommands[2].includes('/remote/next.txt'));
	});

	for (const protocol of ['ftp', 'sftp'] as const) {
		it(`prunes excluded ${protocol.toUpperCase()} directories before listing and honors negation`, async () => {
			const prefix = protocol === 'ftp' ? 'remote/' : '';
			const config: any = {
				...createConfig(protocol),
				downloadExcludePath: [
					`${prefix}ignored`,
					`${prefix}pruned`,
					`!${prefix}ignored/keep.txt`
				]
			};
			const transfer = new FileTransfer(config);
			const listCalls: string[] = [];
			const queuedPaths: string[] = [];
			const originalAddTask = FileTransfer.addTask;
			FileTransfer.addTask = async (task: any) => {
				queuedPaths.push(task.remotePath);
			};
			const client = {
				list: async (remotePath: string) => {
					listCalls.push(remotePath);
					if (remotePath === '/remote') {
						return protocol === 'ftp'
							? [
								{ name: 'ignored', isDirectory: true },
								{ name: 'pruned', isDirectory: true },
								{ name: 'visible.txt', isDirectory: false }
							]
							: [
								{ name: 'ignored', type: 'd' },
								{ name: 'pruned', type: 'd' },
								{ name: 'visible.txt', type: '-' }
							];
					}
					return protocol === 'ftp'
						? [
							{ name: 'keep.txt', isDirectory: false },
							{ name: 'drop.txt', isDirectory: false }
						]
						: [
							{ name: 'keep.txt', type: '-' },
							{ name: 'drop.txt', type: '-' }
						];
				}
			};
			const task: any = {
				config,
				localPath: 'C:\\workspace\\download',
				remotePath: '/remote',
				operationType: 'download',
				isDirectory: true
			};

			try {
				if (protocol === 'ftp') {
					await transfer.downloadFilesFromFTP(client, task.remotePath, task.localPath, task);
				} else {
					await transfer.downloadFilesFromSFTP(client, task.remotePath, task.localPath, task);
				}
			} finally {
				FileTransfer.addTask = originalAddTask;
			}

			assert.deepStrictEqual(listCalls, ['/remote', '/remote/ignored']);
			assert.deepStrictEqual(queuedPaths.sort(), ['/remote/ignored/keep.txt', '/remote/visible.txt']);
		});
	}

	it('uses the previous serial download traversal when concurrency is 1', async () => {
		const config: any = {
			...createConfig('sftp'),
			downloadTraversalConcurrency: 1
		};
		const transfer = new FileTransfer(config);
		let serialCalls = 0;
		let boundedCalls = 0;
		transfer.downloadFilesFromSFTP = async () => {
			serialCalls++;
		};
		transfer.downloadFilesWithBoundedTraversal = async () => {
			boundedCalls++;
		};

		await transfer.downloadFile({}, {
			config,
			localPath: 'C:\\workspace\\download',
			remotePath: '/remote',
			operationType: 'download',
			isDirectory: true
		});

		assert.strictEqual(serialCalls, 1);
		assert.strictEqual(boundedCalls, 0);
	});

	it('lists remote directories concurrently within the configured and global budget', async () => {
		const config: any = {
			...createConfig('sftp'),
			downloadTraversalConcurrency: 2
		};
		const transfer = new FileTransfer(config);
		transfer.maxConnections = 2;
		let active = 0;
		let maxActive = 0;
		const tree: Record<string, any[]> = {
			'/remote': [
				{ name: 'a', type: 'd' },
				{ name: 'b', type: 'd' },
				{ name: 'root.txt', type: '-' }
			],
			'/remote/a': [{ name: 'a.txt', type: '-' }],
			'/remote/b': [{ name: 'b.txt', type: '-' }]
		};
		const createClient = () => ({
			list: async (remotePath: string) => {
				active++;
				maxActive = Math.max(maxActive, active);
				await new Promise(resolve => setTimeout(resolve, 10));
				active--;
				return tree[remotePath] || [];
			}
		});
		const initialClient = createClient();
		transfer.getClient = async () => createClient();
		transfer.releaseClient = async () => undefined;
		const queuedPaths: string[] = [];
		const originalAddTasks = FileTransfer.addTasks;
		FileTransfer.addTasks = async (tasks: any[]) => {
			queuedPaths.push(...tasks.map(task => task.remotePath));
		};

		try {
			await transfer.downloadFile(initialClient, {
				config,
				localPath: 'C:\\workspace\\download',
				remotePath: '/remote',
				operationType: 'download',
				isDirectory: true
			});
		} finally {
			FileTransfer.addTasks = originalAddTasks;
		}

		assert.strictEqual(maxActive, 2);
		assert.deepStrictEqual(queuedPaths, [
			'/remote/a/a.txt',
			'/remote/b/b.txt',
			'/remote/root.txt'
		]);
	});

	it('does not enqueue a partial remote traversal when one directory listing fails', async () => {
		const config: any = {
			...createConfig('sftp'),
			downloadTraversalConcurrency: 2
		};
		const transfer = new FileTransfer(config);
		transfer.maxConnections = 2;
		const createClient = () => ({
			list: async (remotePath: string) => {
				if (remotePath === '/remote') {
					return [{ name: 'ok', type: 'd' }, { name: 'broken', type: 'd' }];
				}
				if (remotePath === '/remote/broken') throw new Error('listing failed');
				return [{ name: 'file.txt', type: '-' }];
			}
		});
		transfer.getClient = async () => createClient();
		transfer.releaseClient = async () => undefined;
		let enqueueCalls = 0;
		const originalAddTasks = FileTransfer.addTasks;
		FileTransfer.addTasks = async () => {
			enqueueCalls++;
		};

		try {
			await assert.rejects(() => transfer.downloadFile(createClient(), {
				config,
				localPath: 'C:\\workspace\\download',
				remotePath: '/remote',
				operationType: 'download',
				isDirectory: true
			}), /listing failed/);
		} finally {
			FileTransfer.addTasks = originalAddTasks;
		}

		assert.strictEqual(enqueueCalls, 0);
	});

	it('falls back immediately when the shared connection budget has no spare lease', async () => {
		const config: any = createConfig('sftp');
		const transfer = new FileTransfer(config);
		transfer.maxConnections = 1;
		const scopeKey = getScopeKey(config);
		const client = { cwd: async () => '/remote' };
		FileTransfer.sftpConnectionPools[scopeKey] = [client];

		const leased = await transfer.getClient(config);
		const unavailable = await transfer.getClient(config, false, false);
		assert.strictEqual(leased, client);
		assert.strictEqual(unavailable, undefined);

		await transfer.releaseClient(leased, config);
		const availableAgain = await transfer.getClient(config, false, false);
		assert.strictEqual(availableAgain, client);
		await transfer.releaseClient(availableAgain, config);
	});

	it('releases an extra FTP traversal client when resetting its working directory fails', async () => {
		const config: any = {
			...createConfig('ftp'),
			downloadTraversalConcurrency: 2
		};
		const transfer = new FileTransfer(config);
		transfer.maxConnections = 2;
		const extraClient = {
			cd: async () => {
				throw new Error('cwd failed');
			}
		};
		transfer.getClient = async () => extraClient;
		const released: any[] = [];
		transfer.releaseClient = async (client: any) => {
			released.push(client);
		};

		await assert.rejects(() => transfer.downloadFile({ list: async () => [] }, {
			config,
			localPath: 'C:\\workspace\\download',
			remotePath: '/',
			operationType: 'download',
			isDirectory: true
		}), /cwd failed/);

		assert.deepStrictEqual(released, [extraClient]);
	});

	it('builds POSIX remote paths when bulk-enqueuing a Windows folder upload', async () => {
		const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-upload-folder-'));
		const localFolder = path.join(workspaceRoot, 'folder');
		const localFile = path.join(localFolder, 'nested', 'file.txt');
		fs.mkdirSync(path.dirname(localFile), { recursive: true });
		fs.writeFileSync(localFile, 'content');
		resetVscodeMock(workspaceRoot);
		const config: any = {
			...createConfig('sftp'),
			workspaceRoot
		};
		const transfer = new FileTransfer(config);
		const originalAddTasks = FileTransfer.addTasks;
		let queuedTasks: any[] = [];
		FileTransfer.addTasks = async (tasks: any[]) => {
			queuedTasks = tasks;
		};

		try {
			await transfer.uploadFolder({
				config,
				localPath: localFolder,
				remotePath: '/remote/folder',
				operationType: 'upload',
				isDirectory: true
			});
		} finally {
			FileTransfer.addTasks = originalAddTasks;
			fs.rmSync(workspaceRoot, { recursive: true, force: true });
			resetVscodeMock('C:\\workspace');
		}

		assert.deepStrictEqual(queuedTasks.map(task => task.remotePath), ['/remote/folder/nested/file.txt']);
	});
});

describe('Deploy watch folder upload paths', () => {
	let FileTransfer: any;
	let Deploy: any;
	let workspaceRoot: string;

	before(function () {
		this.timeout(10000);
		FileTransfer = require('../src/FileTransfer').default;
		Deploy = require('../src/deploy').Deploy;
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
	});

	beforeEach(() => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-deploy-folder-'));
		resetVscodeMock(workspaceRoot);
	});

	afterEach(() => {
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		resetVscodeMock('C:\\workspace');
	});

	it('appends each child file path when a watched directory is pending upload', async () => {
		const localFolder = path.join(workspaceRoot, 'html', 'wordcloud', 'lib');
		const localFile = path.join(localFolder, 'pocketbase.umd.js');
		fs.mkdirSync(localFolder, { recursive: true });
		fs.writeFileSync(localFile, 'content');
		const config: any = {
			name: 'CWISELab',
			type: 'sftp',
			remotePath: '/volumes',
			distPath: [],
			upload_to_root: false,
			workspaceRoot
		};
		const deploy = Object.create(Deploy.prototype);
		deploy.config = config;
		deploy.rootPath = workspaceRoot;
		const originalAddTask = FileTransfer.addTask;
		const queuedTasks: any[] = [];
		FileTransfer.addTask = async (task: any) => queuedTasks.push(task);

		try {
			await deploy.uploadFile({
				file: localFolder,
				opType: { op: 'add', type: 'directory' }
			});
		} finally {
			FileTransfer.addTask = originalAddTask;
		}

		assert.deepStrictEqual(queuedTasks.map(task => task.remotePath), [
			'/volumes/html/wordcloud/lib/pocketbase.umd.js'
		]);
	});
});
