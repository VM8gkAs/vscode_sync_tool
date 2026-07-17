import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	installVscodeMock,
	resetVscodeMock,
	vscodeMockExtensionContext
} from './setup/vscodeMock';

installVscodeMock();

describe('multi-root workspace scope', () => {
	let parentRoot = '';
	let rootA = '';
	let rootB = '';
	let utils: typeof import('../src/utils');
	let FileTransfer: any;

	before(() => {
		utils = require('../src/utils');
		FileTransfer = require('../src/FileTransfer').default;
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
	});

	beforeEach(() => {
		parentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-roots-'));
		rootA = path.join(parentRoot, 'app');
		rootB = path.join(parentRoot, 'app-old');
		fs.mkdirSync(rootA);
		fs.mkdirSync(rootB);
		resetVscodeMock([rootA, rootB]);
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
		FileTransfer.queueConfigs = {};
		FileTransfer.queueOwners = {};
		FileTransfer.queueTerminalStates = {};
		FileTransfer.finalizedQueues = new Set();
		FileTransfer.connectionLimiters = new Map();
		FileTransfer.clientLeaseReleases = new WeakMap();
		fs.rmSync(parentRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	it('resolves files with similar prefixes to their exact workspace folder', () => {
		const fileA = path.join(rootA, 'src', 'index.ts');
		const fileB = path.join(rootB, 'src', 'index.ts');

		assert.strictEqual(utils.getRootPath(fileA), rootA);
		assert.strictEqual(utils.getRootPath(fileB), rootB);
		assert.strictEqual(utils.getRootPath(path.join(parentRoot, 'outside.txt')), '');
		assert.strictEqual(utils.getRootPath(), '');
	});

	it('keeps config caches isolated when workspace folders reuse the same config name', async () => {
		fs.writeFileSync(path.join(rootA, 'sync_config.jsonc'), JSON.stringify({
			main: { type: 'sftp', host: 'a.example.com', port: 22, username: 'a', remotePath: '/a' }
		}));
		fs.writeFileSync(path.join(rootB, 'sync_config.jsonc'), JSON.stringify({
			main: { type: 'sftp', host: 'b.example.com', port: 22, username: 'b', remotePath: '/b' }
		}));

		const configA: any = await utils.getUserConfig(2, 1, rootA);
		const configB: any = await utils.getUserConfig(2, 1, rootB);
		const itemA = utils.toArray(configA, rootA)[0];
		const itemB = utils.toArray(configB, rootB)[0];

		assert.strictEqual(itemA.host, 'a.example.com');
		assert.strictEqual(itemB.host, 'b.example.com');
		assert.notStrictEqual(utils.getConfigScopeKey(itemA), utils.getConfigScopeKey(itemB));
	});

	it('isolates queues and connection pools for identical config names', () => {
		const baseConfig = {
			name: 'main',
			type: 'sftp',
			host: 'example.com',
			port: 22,
			username: 'user',
			remotePath: '/remote'
		};
		const configA = { ...baseConfig, workspaceRoot: rootA };
		const configB = { ...baseConfig, workspaceRoot: rootB };
		new FileTransfer(configA);
		new FileTransfer(configB);

		const scopeA = utils.getConfigScopeKey(configA);
		const scopeB = utils.getConfigScopeKey(configB);
		assert.ok(FileTransfer.queues[scopeA]);
		assert.ok(FileTransfer.queues[scopeB]);
		assert.notStrictEqual(FileTransfer.queues[scopeA], FileTransfer.queues[scopeB]);
		assert.notStrictEqual(FileTransfer.sftpConnectionPools[scopeA], FileTransfer.sftpConnectionPools[scopeB]);
	});
});
