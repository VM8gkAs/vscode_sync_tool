import type { ClientChannel, ExecOptions } from 'ssh2';
import type { Readable } from 'stream';
import type { SFTPClientType, SSHExecCommandResponse } from './types/client';

type RawSshClient = {
    exec(command: string, options: ExecOptions, callback: (error: Error | undefined, channel?: ClientChannel) => void): void;
    on(event: 'error', listener: (error: Error) => void): void;
    removeListener(event: 'error', listener: (error: Error) => void): void;
};

export type SftpCommandOptions = {
    execOptions?: ExecOptions;
    stdin?: string | Buffer | Readable;
    encoding?: BufferEncoding;
};

/**
 * ssh2-sftp-client v12 intentionally does not expose exec(). Keep the one
 * supported escape hatch here so commands reuse the library-owned SSH client
 * and therefore the FileTransfer connection lease.
 */
export function execSftpCommand(
    client: SFTPClientType,
    command: string,
    options: SftpCommandOptions = {}
): Promise<SSHExecCommandResponse> {
    const rawClient = (client as unknown as { client?: RawSshClient }).client;
    if (!rawClient) {
        return Promise.reject(new Error('SFTP client has no active SSH connection'));
    }

    return new Promise((resolve, reject) => {
        let channel: ClientChannel | undefined;
        let exitCode: number | null = null;
        let exitSignal: string | null = null;
        let settled = false;
        const stdout: string[] = [];
        const stderr: string[] = [];
        const encoding = options.encoding || 'utf8';

        const cleanup = () => {
            rawClient.removeListener('error', onClientError);
            if (!channel) return;
            channel.removeListener('data', onStdout);
            channel.removeListener('error', onChannelError);
            channel.removeListener('exit', onExit);
            channel.removeListener('close', onClose);
            channel.stderr.removeListener('data', onStderr);
            channel.stderr.removeListener('error', onChannelError);
        };
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) {
                reject(error);
                return;
            }
            resolve({
                code: exitCode,
                signal: exitSignal,
                stdout: stdout.join('').trim(),
                stderr: stderr.join('').trim()
            });
        };
        const onClientError = (error: Error) => finish(error);
        const onChannelError = (error: Error) => finish(error);
        const onStdout = (chunk: Buffer) => stdout.push(chunk.toString(encoding));
        const onStderr = (chunk: Buffer) => stderr.push(chunk.toString(encoding));
        const onExit = (code: number | undefined, signal: string | undefined) => {
            exitCode = code ?? null;
            exitSignal = signal ?? null;
        };
        const onClose = () => finish();

        rawClient.on('error', onClientError);
        rawClient.exec(command, options.execOptions || {}, (error, openedChannel) => {
            if (error || !openedChannel) {
                finish(error || new Error('SSH command did not open a channel'));
                return;
            }
            channel = openedChannel;
            channel.on('data', onStdout);
            channel.on('error', onChannelError);
            channel.on('exit', onExit);
            channel.on('close', onClose);
            channel.stderr.on('data', onStderr);
            channel.stderr.on('error', onChannelError);
            if (options.stdin && typeof (options.stdin as Readable).pipe === 'function') {
                (options.stdin as Readable).pipe(channel);
            } else if (options.stdin !== undefined) {
                channel.end(options.stdin);
            } else {
                channel.end();
            }
        });
    });
}
