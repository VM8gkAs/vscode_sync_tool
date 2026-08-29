import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
	installVscodeMock,
	resetVscodeMock,
	vscodeMock,
	vscodeMockExtensionContext
} from './setup/vscodeMock';
import { TargetTypes } from '../src/types/config';

installVscodeMock();

describe('deployment command safety', () => {
	let workspaceRoot = '';
	let childProcess: typeof import('child_process');
	let originalExec: typeof childProcess.exec;
	let originalWarning: typeof vscodeMock.window.showWarningMessage;
	let originalExecuteCommand: typeof vscodeMock.commands.executeCommand;

	before(() => {
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
		childProcess = require('child_process');
		originalExec = childProcess.exec;
		originalWarning = vscodeMock.window.showWarningMessage;
		originalExecuteCommand = vscodeMock.commands.executeCommand;
	});

	beforeEach(() => {
		workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-deploy-'));
		resetVscodeMock(workspaceRoot);
	});

	afterEach(() => {
		childProcess.exec = originalExec;
		vscodeMock.window.showWarningMessage = originalWarning;
		vscodeMock.commands.executeCommand = originalExecuteCommand;
		fs.rmSync(workspaceRoot, { recursive: true, force: true });
		resetVscodeMock();
	});

	function createDeploy(build: string) {
		const Deploy = require('../src/deploy').Deploy;
		return new Deploy({
			config: {
				name: 'main',
				type: TargetTypes.sftp,
				host: 'example.com',
				port: 22,
				username: 'user',
				remotePath: '/remote',
				workspaceRoot,
				build
			}
		});
	}

	it('executes a configured build command in a trusted workspace', async () => {
		let receivedCommand = '';
		let receivedCwd = '';
		childProcess.exec = ((command: string, options: { cwd?: string }, callback: (error: Error | null) => void) => {
			receivedCommand = command;
			receivedCwd = options.cwd || '';
			callback(null);
			return {} as ReturnType<typeof childProcess.exec>;
		}) as typeof childProcess.exec;

		await createDeploy('pnpm run build').execBuild();

		assert.strictEqual(receivedCommand, 'pnpm run build');
		assert.strictEqual(receivedCwd, workspaceRoot);
	});

	it('propagates a build command failure', async () => {
		childProcess.exec = ((_command: string, _options: unknown, callback: (error: Error | null) => void) => {
			callback(new Error('build failed'));
			return {} as ReturnType<typeof childProcess.exec>;
		}) as typeof childProcess.exec;

		await assert.rejects(createDeploy('pnpm run build').execBuild(), /build failed/);
	});

	it('does not execute a build command when the trust prompt is cancelled', async () => {
		vscodeMock.workspace.isTrusted = false;
		let execCalls = 0;
		let commandCalls = 0;
		childProcess.exec = (() => {
			execCalls++;
			return {} as ReturnType<typeof childProcess.exec>;
		}) as unknown as typeof childProcess.exec;
		vscodeMock.window.showWarningMessage = async () => undefined;
		vscodeMock.commands.executeCommand = async () => {
			commandCalls++;
		};

		await assert.rejects(createDeploy('pnpm run build').execBuild(), /trusted workspace/);

		assert.strictEqual(execCalls, 0);
		assert.strictEqual(commandCalls, 0);
	});
});
