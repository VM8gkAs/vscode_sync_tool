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
import { TargetTypes } from '../src/types/config';

installVscodeMock();

describe('ignore rule baseline', () => {
	let workspaceRoot = '';
	let utils: typeof import('../src/utils');

	before(() => {
		utils = require('../src/utils');
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
	});

	beforeEach(() => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-ignore-'));
		resetVscodeMock(workspaceRoot);
		setConfigurationValue('gitignore', false);
		setConfigurationValue('excludePath', []);
	});

	afterEach(() => {
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	it('uses the longest matching ignore rule so negations can restore a file', async () => {
		const keepFile = path.join(workspaceRoot, 'dist', 'keep.txt');
		const dropFile = path.join(workspaceRoot, 'dist', 'drop.txt');
		const rules = ['dist', 'dist/**', '!dist/keep.txt'];

		assert.strictEqual(await utils.isIgnore(rules, keepFile), false);
		assert.strictEqual(await utils.isIgnore(rules, dropFile), true);
	});

	it('skips ignored directories during recursive traversal', async () => {
		const srcFile = path.join(workspaceRoot, 'src', 'index.ts');
		const ignoredFile = path.join(workspaceRoot, 'node_modules', 'pkg', 'index.js');
		fs.mkdirSync(path.dirname(srcFile), { recursive: true });
		fs.mkdirSync(path.dirname(ignoredFile), { recursive: true });
		fs.writeFileSync(srcFile, 'export {};');
		fs.writeFileSync(ignoredFile, 'module.exports = {};');

		const files = await utils.getAllFiles(workspaceRoot, true, ['node_modules', 'node_modules/**']);

		assert.deepStrictEqual(files.map(file => path.relative(workspaceRoot, file).split(path.sep).join('/')).sort(), ['src/index.ts']);
	});

	it('restores an exact file from an ignored directory on Windows-safe paths', async () => {
		const keepFile = path.join(workspaceRoot, 'dist', 'keep.txt');
		const dropFile = path.join(workspaceRoot, 'dist', 'drop.txt');
		fs.mkdirSync(path.dirname(keepFile), { recursive: true });
		fs.writeFileSync(keepFile, 'keep');
		fs.writeFileSync(dropFile, 'drop');

		const files = await utils.getAllowFiles({
			name: 'main',
			type: TargetTypes.sftp,
			host: 'example.com',
			port: 22,
			username: 'user',
			remotePath: '/remote',
			excludePath: ['dist', '!dist/keep.txt']
		}, workspaceRoot);

		assert.deepStrictEqual(
			files && files.map(file => path.relative(workspaceRoot, file).split(path.sep).join('/')).sort(),
			['dist/keep.txt']
		);
	});

	it('rejects negated traversal roots that escape the workspace', () => {
		assert.strictEqual(utils.getNegatedTraversalRoot(workspaceRoot, '!../outside.txt'), null);
	});
});
