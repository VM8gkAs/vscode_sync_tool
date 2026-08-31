import assert from 'assert';
import { EventEmitter } from 'events';
import { installVscodeMock, resetVscodeMock } from './setup/vscodeMock';

installVscodeMock();

describe('SSH remote ZIP extraction', () => {
	let FileTransfer: any;
	let buildRemoteUnzipCommand: (remoteArchivePath: string, destinationPath: string) => string;
	let buildRemoteZipListCommand: (remoteArchivePath: string) => string;
	let findUnsafeZipEntry: (listing: string) => string | undefined;
	let quotePosixShellArgument: (value: string) => string;

	before(() => {
		const fileTransferModule = require('../src/FileTransfer');
		FileTransfer = fileTransferModule.default;
		buildRemoteUnzipCommand = fileTransferModule.buildRemoteUnzipCommand;
		buildRemoteZipListCommand = fileTransferModule.buildRemoteZipListCommand;
		findUnsafeZipEntry = fileTransferModule.findUnsafeZipEntry;
		quotePosixShellArgument = fileTransferModule.quotePosixShellArgument;
	});

	beforeEach(() => resetVscodeMock());

	function createTransfer() {
		return new FileTransfer({
			name: 'main',
			type: 'ssh',
			host: 'example.com',
			port: 22,
			username: 'user',
			password: 'pw',
			remotePath: '/srv/app',
			workspaceRoot: 'C:\\workspace'
		});
	}

	function createCommandClient(run: (command: string) => Promise<{ stdout: string; stderr: string; code: number | null; signal: string | null }>) {
		const rawClient = new EventEmitter() as EventEmitter & { exec: Function };
		rawClient.exec = (command: string, _options: unknown, callback: Function) => {
			const channel = new EventEmitter() as EventEmitter & { stderr: EventEmitter; end: () => void };
			channel.stderr = new EventEmitter();
			channel.end = () => {
				void run(command).then(result => {
					if (result.stdout) channel.emit('data', Buffer.from(result.stdout));
					if (result.stderr) channel.stderr.emit('data', Buffer.from(result.stderr));
					channel.emit('exit', result.code, result.signal);
					channel.emit('close');
				});
			};
			callback(undefined, channel);
		};
		return { client: rawClient } as any;
	}

	it('quotes archive and destination paths as single POSIX shell arguments', () => {
		assert.strictEqual(
			buildRemoteUnzipCommand("/srv/a b/it's;$(touch nope).zip", '/srv/out dir'),
			`unzip -o '/srv/a b/it'"'"'s;$(touch nope).zip' -d '/srv/out dir'`
		);
		assert.strictEqual(quotePosixShellArgument('safe'), "'safe'");
		assert.strictEqual(buildRemoteZipListCommand('/srv/release.zip'), "unzip -Z1 '/srv/release.zip'");
	});

	it('detects absolute, drive-qualified, and parent-traversal ZIP entries', () => {
		assert.strictEqual(findUnsafeZipEntry('safe/file.txt\n../escape.txt'), '../escape.txt');
		assert.strictEqual(findUnsafeZipEntry('safe/file.txt\n/etc/passwd'), '/etc/passwd');
		assert.strictEqual(findUnsafeZipEntry('safe/file.txt\nC:\\temp\\escape.txt'), 'C:\\temp\\escape.txt');
		assert.strictEqual(findUnsafeZipEntry('safe/file.txt\nnested/ok.txt'), undefined);
	});

	it('rejects empty and control-character paths before executing a shell command', () => {
		assert.throws(() => quotePosixShellArgument(''), /Invalid remote path/);
		assert.throws(() => quotePosixShellArgument('/srv/bad\nname.zip'), /Invalid remote path/);
		assert.throws(() => quotePosixShellArgument('/srv/bad\0name.zip'), /Invalid remote path/);
	});

	it('checks unzip availability before extraction', async () => {
		const commands: string[] = [];
		const client = createCommandClient(async (command: string) => {
				commands.push(command);
				return { stdout: '', stderr: '', code: 127, signal: null };
			});

		await assert.rejects(
			() => createTransfer().unzipRemoteFile(client, '/srv/app/release.zip', '/srv/app'),
			/unzip command/
		);
		assert.deepStrictEqual(commands, ['command -v unzip >/dev/null 2>&1']);
	});

	it('requires an SSH ZIP archive', async () => {
		let calls = 0;
		const client = createCommandClient(async () => {
				calls++;
				return { stdout: '', stderr: '', code: 0, signal: null };
			});

		await assert.rejects(
			() => createTransfer().unzipRemoteFile(client, '/srv/app/release.tar', '/srv/app'),
			/Only SSH ZIP files/
		);
		assert.strictEqual(calls, 0);
	});

	it('reports a non-zero unzip exit code and preserves stderr', async () => {
		const responses = [
			{ stdout: '/usr/bin/unzip', stderr: '', code: 0, signal: null },
			{ stdout: '', stderr: 'invalid archive', code: 9, signal: null }
		];
		const client = createCommandClient(async () => responses.shift()!);

		await assert.rejects(
			() => createTransfer().unzipRemoteFile(client, '/srv/app/release.zip', '/srv/app'),
			/invalid archive/
		);
	});

	it('rejects unsafe ZIP entries before extraction', async () => {
		const commands: string[] = [];
		const responses = [
			{ stdout: '/usr/bin/unzip', stderr: '', code: 0, signal: null },
			{ stdout: 'safe/file.txt\n../escape.txt', stderr: '', code: 0, signal: null }
		];
		const client = createCommandClient(async (command: string) => {
				commands.push(command);
				return responses.shift()!;
			});

		await assert.rejects(
			() => createTransfer().unzipRemoteFile(client, '/srv/app/release.zip', '/srv/app'),
			/unsafe path/
		);
		assert.strictEqual(commands.length, 2);
	});

	it('executes extraction only after a successful capability check', async () => {
		const commands: string[] = [];
		const client = createCommandClient(async (command: string) => {
				commands.push(command);
				return {
					stdout: command.startsWith('unzip -Z1') ? 'file.txt' : '',
					stderr: '',
					code: 0,
					signal: null
				};
			});

		await createTransfer().unzipRemoteFile(client, '/srv/app/release.zip', '/srv/app');

		assert.deepStrictEqual(commands, [
			'command -v unzip >/dev/null 2>&1',
			"unzip -Z1 '/srv/app/release.zip'",
			"unzip -o '/srv/app/release.zip' -d '/srv/app'"
		]);
	});
});
