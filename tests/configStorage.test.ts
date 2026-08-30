import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	installVscodeMock,
	resetVscodeMock,
	setConfigurationValue,
	vscodeMockExtensionContext
} from './setup/vscodeMock';

installVscodeMock();

describe('external configuration storage', () => {
	let fixtureRoot = '';
	let rootA = '';
	let rootB = '';
	let storeRoot = '';
	let utils: typeof import('../src/utils');

	before(() => {
		utils = require('../src/utils');
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
	});

	beforeEach(() => {
		fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-config-store-'));
		rootA = path.join(fixtureRoot, 'one', 'project');
		rootB = path.join(fixtureRoot, 'two', 'project');
		storeRoot = path.join(fixtureRoot, 'config-store');
		fs.mkdirSync(rootA, { recursive: true });
		fs.mkdirSync(rootB, { recursive: true });
		fs.mkdirSync(storeRoot, { recursive: true });
		resetVscodeMock([rootA, rootB]);
		setConfigurationValue('configStorePath', storeRoot);
	});

	afterEach(() => {
		setConfigurationValue('configStorePath', '');
		fs.rmSync(fixtureRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	it('isolates same-name workspaces with stable hashed directories', () => {
		const pathA = utils.getPreferredConfigFilePath(rootA);
		const pathB = utils.getPreferredConfigFilePath(rootB);

		assert.notStrictEqual(pathA, pathB);
		assert.strictEqual(path.dirname(path.dirname(pathA)), storeRoot);
		assert.strictEqual(path.dirname(path.dirname(pathB)), storeRoot);
		assert.strictEqual(utils.getPreferredConfigFilePath(rootA), pathA);
	});

	it('uses the project config as a migration fallback until the external file exists', () => {
		const projectConfig = path.join(rootA, 'sync_config.jsonc');
		const externalConfig = utils.getPreferredConfigFilePath(rootA);
		fs.writeFileSync(projectConfig, '{}');

		assert.strictEqual(utils.getConfigFilePath(rootA), projectConfig);

		fs.mkdirSync(path.dirname(externalConfig), { recursive: true });
		fs.writeFileSync(externalConfig, '{}');
		assert.strictEqual(utils.getConfigFilePath(rootA), externalConfig);
	});

	it('reads an external config without modifying the project gitignore', async () => {
		const externalConfig = utils.getPreferredConfigFilePath(rootA);
		fs.mkdirSync(path.dirname(externalConfig), { recursive: true });
		fs.writeFileSync(externalConfig, JSON.stringify({
			main: {
				type: 'sftp',
				host: 'example.com',
				username: 'user',
				remotePath: '/remote'
			}
		}));
		const gitignorePath = path.join(rootA, '.gitignore');
		fs.writeFileSync(gitignorePath, 'node_modules');

		const config = await utils.getUserConfig(2, 1, rootA);

		assert.ok(config && config.main);
		assert.strictEqual(fs.readFileSync(gitignorePath, 'utf8'), 'node_modules');
	});

	it('rejects relative and workspace-internal store paths', () => {
		assert.strictEqual(
			utils.getPreferredConfigFilePath(rootA, 'relative-store'),
			path.join(rootA, 'sync_config.jsonc')
		);
		assert.strictEqual(
			utils.getPreferredConfigFilePath(rootA, path.join(rootA, 'private')),
			path.join(rootA, 'sync_config.jsonc')
		);
		assert.strictEqual(
			utils.getPreferredConfigFilePath(rootA, path.join(rootB, 'private')),
			path.join(rootA, 'sync_config.jsonc')
		);
	});

	it('rolls back copied targets when a relocation transaction fails', async () => {
		const sourceA = path.join(rootA, 'a.jsonc');
		const sourceB = path.join(rootB, 'b.jsonc');
		const targetA = path.join(storeRoot, 'a', 'sync_config.jsonc');
		const blockedParent = path.join(storeRoot, 'blocked');
		const targetB = path.join(blockedParent, 'sync_config.jsonc');
		fs.writeFileSync(sourceA, '{}');
		fs.writeFileSync(sourceB, '{}');
		fs.writeFileSync(blockedParent, 'not-a-directory');

		await assert.rejects(() => utils.copyConfigFilesTransactionally([
			{ sourcePath: sourceA, targetPath: targetA },
			{ sourcePath: sourceB, targetPath: targetB }
		], async () => undefined));

		assert.strictEqual(fs.existsSync(targetA), false);
		assert.strictEqual(fs.existsSync(sourceA), true);
		assert.strictEqual(fs.existsSync(sourceB), true);
	});
});
