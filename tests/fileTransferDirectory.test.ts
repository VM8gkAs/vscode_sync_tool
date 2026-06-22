import assert from 'assert';
import { installVscodeMock, resetVscodeMock } from './setup/vscodeMock';

installVscodeMock();

describe('FileTransfer.checkExistFolder', () => {
	let FileTransfer: any;

	before(() => {
		FileTransfer = require('../src/FileTransfer').default;
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
	});

	function createConfig(type: 'ftp' | 'sftp') {
		return {
			name: `main-${type}`,
			type,
			host: 'example.com',
			port: type === 'ftp' ? 21 : 22,
			username: 'user',
			password: 'pw',
			remotePath: '/remote'
		};
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
		FileTransfer.sftpConnectionPools[config.name] = [];
		FileTransfer.queues[config.name] = {
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
		assert.strictEqual(FileTransfer.queues[config.name].concurrency, 2);
	});

	it('rate-limits repeated concurrency probes after a successful probe', async () => {
		const config = createConfig('sftp');
		const transfer = new FileTransfer(config);
		transfer.uploadTaskNumber = 1;
		transfer.maxConnections = 3;
		FileTransfer.concurrencyProbeCooldownMs = 100000;
		FileTransfer.sftpConnectionPools[config.name] = [];
		FileTransfer.queues[config.name] = {
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
		assert.strictEqual(FileTransfer.queues[config.name].concurrency, 2);
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
});
