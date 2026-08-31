import assert from 'assert';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateRandomPassword } from '../src/utils';
import { execSftpCommand } from '../src/sftpCommand';
import { applySftpPrivateKey } from '../src/sftpConnection';

describe('security and SFTP command boundaries', () => {
	it('generates fixed-length alphanumeric secrets without Math.random', () => {
		const originalRandom = Math.random;
		Math.random = () => { throw new Error('Math.random must not be used for secrets'); };
		try {
			const secret = generateRandomPassword(32);
			assert.match(secret, /^[A-Za-z0-9]{32}$/);
			assert.strictEqual(generateRandomPassword(0), '');
		} finally {
			Math.random = originalRandom;
		}
	});

	it('runs commands through the library-owned SSH client and cleans stream listeners', async () => {
		const rawClient = new EventEmitter() as EventEmitter & { exec: Function };
		const channel = new EventEmitter() as EventEmitter & { stderr: EventEmitter; end: () => void };
		channel.stderr = new EventEmitter();
		channel.end = () => {
			channel.emit('data', Buffer.from('standard output'));
			channel.stderr.emit('data', Buffer.from('standard error'));
			channel.emit('exit', 7, 'SIGTERM');
			channel.emit('close');
		};
		rawClient.exec = (_command: string, _options: unknown, callback: Function) => callback(undefined, channel);

		const result = await execSftpCommand({ client: rawClient } as any, 'command');

		assert.deepStrictEqual(result, {
			stdout: 'standard output',
			stderr: 'standard error',
			code: 7,
			signal: 'SIGTERM'
		});
		assert.strictEqual(rawClient.listenerCount('error'), 0);
		assert.strictEqual(channel.listenerCount('data'), 0);
		assert.strictEqual(channel.stderr.listenerCount('data'), 0);
	});

	it('loads privateKeyPath content for ssh2-sftp-client 12 connections', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sync-sftp-key-'));
		const keyPath = path.join(directory, 'id_test');
		fs.writeFileSync(keyPath, 'test-private-key');
		const config: any = {
			privateKeyPath: keyPath,
			password: 'password-fallback'
		};

		try {
			applySftpPrivateKey(config);
			assert.strictEqual(config.privateKeyPath, undefined);
			assert.strictEqual(config.password, undefined);
			assert.strictEqual(config.privateKey.toString('utf8'), 'test-private-key');
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});
