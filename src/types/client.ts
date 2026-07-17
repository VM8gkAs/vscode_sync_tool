import type {
    AccessOptions,
    Client as FTPClient,
    FileInfo as FTPFileInfo,
    FTPResponse,
    UploadOptions
} from 'basic-ftp-proxy';
import type { ProgressInfo as FTPProgressInfo } from 'basic-ftp-proxy/dist/ProgressTracker';
import type {
    ConnectConfig,
    ReadStream,
    ReadStreamOptions,
    SFTPWrapper,
    WriteStream,
    WriteStreamOptions
} from 'ssh2';
import type { Readable, Writable } from 'stream';

export type FTPClientType = FTPClient;
export type FTPRemoteFileInfo = FTPFileInfo;
export type FTPProgressHandler = (info: FTPProgressInfo) => void;

export interface SFTPClientType {
    connect(options: SFTPConnectOptions): Promise<SFTPWrapper>;
    list(remoteFilePath: string, filter?: SFTPListFilterFunction): Promise<SFTPFileInfo[]>;
    exists(remotePath: string): Promise<false | SFTPFileInfoType>;
    stat(remotePath: string): Promise<SFTPFileStats>;
    realPath(remotePath: string): Promise<string>;
    get(
        path: string,
        dst?: string | NodeJS.WritableStream,
        options?: SFTPTransferOptions,
    ): Promise<string | NodeJS.WritableStream | Buffer>;
    fastGet(remoteFilePath: string, localPath: string, options?: SFTPFastGetTransferOptions): Promise<string>;
    put(
        input: string | Buffer | NodeJS.ReadableStream,
        remoteFilePath: string,
        options?: SFTPTransferOptions,
    ): Promise<string>;
    fastPut(localPath: string, remoteFilePath: string, options?: SFTPFastPutTransferOptions): Promise<string>;
    cwd(): Promise<string>;
    exec(command: string, options?: Record<string, unknown>, addListeners?: boolean): Promise<SSHExecCommandResponse>;
    mkdir(remoteFilePath: string, recursive?: boolean): Promise<string>;
    rmdir(remoteFilePath: string, recursive?: boolean): Promise<string>;
    delete(remoteFilePath: string, noErrorOK?: boolean): Promise<string>;
    rename(remoteSourcePath: string, remoteDestPath: string): Promise<string>;
    chmod(remotePath: string, mode: number | string): Promise<string>;
    append(
        input: Buffer | NodeJS.ReadableStream,
        remotePath: string,
        options?: SFTPWriteStreamOptions,
    ): Promise<string>;
    uploadDir(srcDir: string, destDir: string, options?: SFTPUploadDirOptions): Promise<string>;
    downloadDir(srcDir: string, destDir: string, options?: SFTPDownloadDirOptions): Promise<string>;
    end(): Promise<void>;
    on(event: string, callback: (...args: unknown[]) => void): void;
    removeListener(event: string, callback: (...args: unknown[]) => void): void;
    posixRename(fromPath: string, toPath: string): Promise<string>;
    rcopy(srcPath: string, dstPath: string): Promise<string>;
    createReadStream(remotePath: string, options?: ReadStreamOptions): ReadStream;
    createWriteStream(remotePath: string, options?: WriteStreamOptions): WriteStream;
    sftp?: SFTPWrapper;
}

export type SFTPFileInfoType = "d" | "-" | "l";

export interface SFTPConnectOptions extends ConnectConfig {
    retries?: number;
    retry_factor?: number;
    retry_minTimeout?: number;
    strictVendor?: boolean;
}

export interface SFTPFileInfo {
    type: SFTPFileInfoType;
    name: string;
    size: number;
    modifyTime: number;
    accessTime: number;
    rights: {
        user: string;
        group: string;
        other: string;
    };
    owner: number;
    group: number;
}

export interface SFTPFileStats {
    mode: number;
    uid: number;
    gid: number;
    size: number;
    accessTime: number;
    modifyTime: number;
    isDirectory: boolean;
    isFile: boolean;
    isBlockDevice: boolean;
    isCharacterDevice: boolean;
    isSymbolicLink: boolean;
    isFIFO: boolean;
    isSocket: boolean;
}

export type SFTPListFilterFunction = (fileInfo: SFTPFileInfo) => boolean;
export type RemoteFileInfo = FTPRemoteFileInfo | SFTPFileInfo;

export interface SFTPTransferOptions {
    pipeOptions?: SFTPPipeOptions;
    writeStreamOptions?: SFTPWriteStreamOptions;
    readStreamOptions?: SFTPReadStreamOptions;
}

export interface SFTPPipeOptions {
    end?: boolean;
}

export interface SFTPReadStreamOptions {
    flags?: "r";
    encoding?: null | string;
    handle?: null | string;
    autoClose?: boolean;
    mode?: number | string;
}

export interface SFTPWriteStreamOptions {
    flags?: "w" | "a";
    encoding?: null | string;
    autoClose?: boolean;
    mode?: number | string;
}

export interface SFTPFastGetTransferOptions {
    concurrency?: number;
    chunkSize?: number;
    step?: (totalTransferred: number, chunk: number, total: number) => void;
}

export interface SFTPFastPutTransferOptions extends SFTPFastGetTransferOptions {
    flags?: string;
    autoClose?: boolean;
    mode?: number | string;
}

export interface SFTPUploadDirOptions {
    filter?: SFTPDirFilterFunction;
    useFastput?: boolean;
}

export interface SFTPDownloadDirOptions {
    filter?: SFTPDirFilterFunction;
    useFastget?: boolean;
}

export type SFTPDirFilterFunction = (filePath: string, isDirectory: boolean) => boolean;

export interface SSHExecCommandResponse {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
}

export type FileTransferClient = FTPClientType | SFTPClientType;

// Type guard to check if client is FTP
export function isFTPClient(client: FileTransferClient): client is FTPClientType {
    return 'access' in client && typeof client.access === 'function';
}

// Type guard to check if client is SFTP
export function isSFTPClient(client: FileTransferClient): client is SFTPClientType {
    return 'fastGet' in client && typeof client.fastGet === 'function';
}

export type SFTPProgressHandler = (totalTransferred: number, chunk: number, total: number) => void;

export interface IFileTransferClient {
    close(): void;
    get closed(): boolean;

    cd(path: string): Promise<FTPResponse | string>;
    cwd(): Promise<string>;
    list(path?: string): Promise<RemoteFileInfo[]>;

    uploadFrom(source: Readable | string, toRemotePath: string, options?: UploadOptions): Promise<FTPResponse>;
    downloadTo(destination: Writable | string, fromRemotePath: string, startAt?: number): Promise<FTPResponse>;
    remove(path: string, ignoreErrorCodes?: boolean): Promise<FTPResponse>;
    rename(srcPath: string, destPath: string): Promise<FTPResponse | string>;
    lastMod(path: string): Promise<Date>;
    size(path: string): Promise<number>;

    trackProgress(handler?: FTPProgressHandler): void;

    sftp?: SFTPWrapper;
    exists?(path: string): Promise<false | SFTPFileInfoType>;
    mkdir?(path: string, recursive?: boolean): Promise<string>;
    fastGet?(remotePath: string, localPath: string, options?: SFTPFastGetTransferOptions): Promise<string>;
    fastPut?(localPath: string, remotePath: string, options?: SFTPFastPutTransferOptions): Promise<string>;
    uploadDir?(srcDir: string, destDir: string, options?: SFTPUploadDirOptions): Promise<string>;
    downloadDir?(srcDir: string, destDir: string, options?: SFTPDownloadDirOptions): Promise<string>;
    end?(): Promise<void>;
}
