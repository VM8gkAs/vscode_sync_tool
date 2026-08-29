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

	it('treats a trailing globstar rule as matching both the directory root and descendants', async () => {
		const toolsDirectory = path.join(workspaceRoot, 'tools');
		const toolsFile = path.join(toolsDirectory, 'nested', 'file.txt');
		const matcher = utils.createPathIgnoreMatcher(['tools/**'], workspaceRoot);

		assert.strictEqual(matcher.isIgnored(toolsDirectory), true);
		assert.strictEqual(matcher.isIgnored(toolsFile), true);
		assert.strictEqual(matcher.shouldTraverse(toolsDirectory), false);
		assert.strictEqual(await utils.resolveWatchChangeForIgnore(
			['tools/**'],
			toolsDirectory,
			{ op: 'add', type: 'directory' }
		), null);
	});

	it('keeps local traversal output stable across concurrency settings', async () => {
		for (const relativeFile of ['a/1.txt', 'a/2.txt', 'b/3.txt', 'root.txt']) {
			const file = path.join(workspaceRoot, relativeFile);
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, relativeFile);
		}

		const serial = await utils.getAllFiles(workspaceRoot, false, [], 1);
		const concurrent = await utils.getAllFiles(workspaceRoot, false, [], 4);

		assert.deepStrictEqual(concurrent, serial);
	});

	it('bounds asynchronous local directory reads at the configured concurrency', async () => {
		for (let index = 0; index < 8; index++) {
			const file = path.join(workspaceRoot, `dir-${index}`, 'file.txt');
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, String(index));
		}
		const fsExtra = require('fs-extra');
		const originalReaddir = fsExtra.promises.readdir;
		let active = 0;
		let maxActive = 0;
		fsExtra.promises.readdir = async (...args: any[]) => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise(resolve => setTimeout(resolve, 5));
			try {
				return await originalReaddir(...args);
			} finally {
				active--;
			}
		};

		try {
			await utils.getAllFiles(workspaceRoot, false, [], 2);
		} finally {
			fsExtra.promises.readdir = originalReaddir;
		}

		assert.strictEqual(maxActive, 2);
	});

	it('normalizes traversal concurrency to a safe range', () => {
		assert.strictEqual(utils.normalizeTraversalConcurrency(undefined, 4), 4);
		assert.strictEqual(utils.normalizeTraversalConcurrency(0, 4), 1);
		assert.strictEqual(utils.normalizeTraversalConcurrency(2.9, 4), 2);
		assert.strictEqual(utils.normalizeTraversalConcurrency(99, 4), 16);
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

	it('uses the same matcher semantics for remote POSIX paths', () => {
		const matcher = utils.createPathIgnoreMatcher(
			['dist', '!dist/keep.txt', 'logs/*.tmp'],
			'/srv/app'
		);

		assert.strictEqual(matcher.isIgnored('/srv/app/dist/drop.txt'), true);
		assert.strictEqual(matcher.isIgnored('/srv/app/dist/keep.txt'), false);
		assert.strictEqual(matcher.isIgnored('/srv/app/logs/debug.tmp'), true);
		assert.strictEqual(matcher.isIgnored('/srv/other/escape.txt'), true);
		assert.strictEqual(matcher.shouldTraverse('/srv/app/dist'), true);
	});

	it('merges global, config, and gitignore rules in that order', async () => {
		setConfigurationValue('gitignore', true);
		setConfigurationValue('excludePath', ['dist']);
		fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), '!dist/from-git.txt');
		const config = {
			name: 'main',
			type: TargetTypes.sftp,
			host: 'example.com',
			port: 22,
			username: 'user',
			remotePath: '/remote',
			workspaceRoot,
			excludePath: ['!dist/from-config.txt']
		};
		const rules = await utils.getIgnoreConfig(config, workspaceRoot);
		const matcher = utils.createPathIgnoreMatcher(rules, workspaceRoot);

		assert.strictEqual(matcher.isIgnored(path.join(workspaceRoot, 'dist', 'drop.txt')), true);
		assert.strictEqual(matcher.isIgnored(path.join(workspaceRoot, 'dist', 'from-config.txt')), false);
		assert.strictEqual(matcher.isIgnored(path.join(workspaceRoot, 'dist', 'from-git.txt')), false);
	});

	it('rejects when reading the gitignore cache source fails', async () => {
		setConfigurationValue('gitignore', true);
		fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), 'dist');
		const fsExtra = require('fs-extra');
		const originalReadFileSync = fsExtra.readFileSync;
		fsExtra.readFileSync = () => {
			throw new Error('gitignore read failed');
		};

		try {
			await assert.rejects(utils.getIgnoreConfig({
				name: 'main',
				type: TargetTypes.sftp,
				host: 'example.com',
				port: 22,
				username: 'user',
				remotePath: '/remote',
				workspaceRoot
			}, workspaceRoot), /gitignore read failed/);
		} finally {
			fsExtra.readFileSync = originalReadFileSync;
		}
	});

	it('rejects when persisting the gitignore cache fails', async () => {
		setConfigurationValue('gitignore', true);
		fs.writeFileSync(path.join(workspaceRoot, '.gitignore'), 'dist');
		const originalUpdate = vscodeMockExtensionContext.workspaceState.update;
		vscodeMockExtensionContext.workspaceState.update = async () => {
			throw new Error('ignore cache write failed');
		};

		try {
			await assert.rejects(utils.getIgnoreConfig({
				name: 'main',
				type: TargetTypes.sftp,
				host: 'example.com',
				port: 22,
				username: 'user',
				remotePath: '/remote',
				workspaceRoot
			}, workspaceRoot), /ignore cache write failed/);
		} finally {
			vscodeMockExtensionContext.workspaceState.update = originalUpdate;
		}
	});

	it('converts a rename into an ignored folder to a delete of the original path', async () => {
		const sourceFile = path.join(workspaceRoot, 'src', 'tool.txt');
		const targetFile = path.join(workspaceRoot, 'tools', 'tool.txt');

		const change = await utils.resolveWatchChangeForIgnore(
			['tools/**'],
			sourceFile,
			{ op: 'rename', type: 'file', newname: targetFile }
		);

		assert.deepStrictEqual(change, {
			file: sourceFile,
			opType: { op: 'delete', type: 'file' }
		});
	});

	it('converts a rename out of an ignored folder to an add of the new path', async () => {
		const sourceFile = path.join(workspaceRoot, 'tools', 'tool.txt');
		const targetFile = path.join(workspaceRoot, 'src', 'tool.txt');

		const change = await utils.resolveWatchChangeForIgnore(
			['tools/**'],
			sourceFile,
			{ op: 'rename', type: 'file', newname: targetFile }
		);

		assert.deepStrictEqual(change, {
			file: targetFile,
			opType: { op: 'add', type: 'file' }
		});
	});

	it('classifies same-folder path changes as rename and cross-folder changes as move', async () => {
		const sourceFile = path.join(workspaceRoot, 'src', 'tool.txt');
		const renamedFile = path.join(workspaceRoot, 'src', 'renamed.txt');
		const movedFile = path.join(workspaceRoot, 'tools', 'tool.txt');

		assert.strictEqual(utils.getPathChangeType(sourceFile, renamedFile), 'rename');
		assert.strictEqual(utils.getPathChangeType(sourceFile, movedFile), 'move');
	});

	it('preserves path change classification when a rename passes the policy gate', async () => {
		const sourceFile = path.join(workspaceRoot, 'src', 'tool.txt');
		const targetFile = path.join(workspaceRoot, 'tools', 'tool.txt');

		const change = await utils.resolveWatchChangeForIgnore(
			[],
			sourceFile,
			{ op: 'rename', type: 'file', newname: targetFile }
		);

		assert.deepStrictEqual(change, {
			file: sourceFile,
			opType: { op: 'rename', type: 'file', newname: targetFile, pathChangeType: 'move' }
		});
	});
});
