import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	installVscodeMock,
	resetVscodeMock,
	setConfigurationValue,
	vscodeMockOutput,
	vscodeMockExtensionContext
} from './setup/vscodeMock';

installVscodeMock();

describe('Output file logging', () => {
	let workspaceRoot = '';
	let output: typeof import('../src/output');
	let utils: typeof import('../src/utils');

	before(() => {
		output = require('../src/output');
		utils = require('../src/utils');
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
	});

	beforeEach(() => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-output-'));
		resetVscodeMock(workspaceRoot);
		setConfigurationValue('logToFile', false);
		setConfigurationValue('logDirectory', 'sync_logs');
		setConfigurationValue('logNumberLimit', 500);
		setConfigurationValue('gitignore', false);
		setConfigurationValue('excludePath', []);
		output.cleanLogTask(true);
	});

	afterEach(() => {
		output.cleanLogTask(true);
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	it('writes Output lines to the default workspace-relative directory when enabled', async () => {
		setConfigurationValue('logToFile', true);

		await output.writeSyncLogLine({ workspaceRoot }, '[sync] first line');

		const logFile = path.join(workspaceRoot, 'sync_logs', output.SYNC_LOG_FILE_NAME);
		assert.strictEqual(fs.readFileSync(logFile, 'utf8'), '[sync] first line\n');
	});

	it('retains the newest Output entries up to the configured limit', () => {
		setConfigurationValue('logNumberLimit', 2);
		output.addLogTask('oldest');
		output.addLogTask('middle');
		output.addLogTask('newest');
		output.updateProgress(true);

		assert.doesNotMatch(vscodeMockOutput.value, /oldest/);
		assert.match(vscodeMockOutput.value, /middle/);
		assert.match(vscodeMockOutput.value, /newest/);
	});

	it('supports a custom relative directory and preserves concurrent write order', async () => {
		setConfigurationValue('logToFile', true);
		setConfigurationValue('logDirectory', path.join('.local', 'sync-history'));

		await Promise.all([
			output.writeSyncLogLine({ workspaceRoot }, 'first'),
			output.writeSyncLogLine({ workspaceRoot }, 'second')
		]);

		const logFile = path.join(workspaceRoot, '.local', 'sync-history', output.SYNC_LOG_FILE_NAME);
		assert.strictEqual(fs.readFileSync(logFile, 'utf8'), 'first\nsecond\n');
	});

	it('keeps file logs isolated by workspace root', async () => {
		setConfigurationValue('logToFile', true);
		const secondWorkspaceRoot = path.join(workspaceRoot, 'second-workspace');
		fs.mkdirSync(secondWorkspaceRoot);

		await Promise.all([
			output.writeSyncLogLine({ workspaceRoot }, 'first workspace'),
			output.writeSyncLogLine({ workspaceRoot: secondWorkspaceRoot }, 'second workspace')
		]);

		assert.strictEqual(
			fs.readFileSync(path.join(workspaceRoot, 'sync_logs', output.SYNC_LOG_FILE_NAME), 'utf8'),
			'first workspace\n'
		);
		assert.strictEqual(
			fs.readFileSync(path.join(secondWorkspaceRoot, 'sync_logs', output.SYNC_LOG_FILE_NAME), 'utf8'),
			'second workspace\n'
		);
	});

	it('rejects absolute, escaping, empty, and workspace-root log directories', () => {
		setConfigurationValue('logToFile', true);
		const invalidDirectories = [
			path.resolve(workspaceRoot, '..', 'outside'),
			path.join('..', 'outside'),
			'',
			'.'
		];

		for (const directory of invalidDirectories) {
			setConfigurationValue('logDirectory', directory);
			assert.strictEqual(output.getSyncLogFilePath({ workspaceRoot }), null);
		}
	});

	it('excludes the enabled log directory from upload matching', async () => {
		setConfigurationValue('logToFile', true);
		setConfigurationValue('logDirectory', path.join('.local', 'sync-history'));
		const config: any = {
			name: 'main',
			type: 'sftp',
			host: 'example.com',
			port: 22,
			username: 'user',
			remotePath: '/remote',
			workspaceRoot
		};

		const ignoreRules = await utils.getIgnoreConfig(config, workspaceRoot);
		const matcher = utils.createPathIgnoreMatcher(ignoreRules, workspaceRoot);

		assert.strictEqual(
			matcher.isIgnored(path.join(workspaceRoot, '.local', 'sync-history', output.SYNC_LOG_FILE_NAME)),
			true
		);
		assert.strictEqual(matcher.isIgnored(path.join(workspaceRoot, 'src', 'index.ts')), false);
	});
});
