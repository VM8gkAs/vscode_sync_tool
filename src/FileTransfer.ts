const SftpClient = require("./lib/ssh2-sftp-client/index")
const ftp = require("basic-ftp-proxy")
const proxySocket = require("basic-ftp-proxy/dist/proxySocket")

import fs from "fs-extra"
import path from 'path';
import dayjs from "dayjs"
import async from 'async';
import { l10n } from 'vscode';
import * as vscode from "vscode"
import { EventEmitter } from 'events';
import { FileTransferConfigItem, Task, TargetTypes, proxyConfigType, TaskTerminalState } from "./types/config";
import { getRootPath, getAllowFiles, isUpRoot, formatFileSize, getUseTime, getPluginSetting, sleep, getNormalPath, oConsole, posixRelative, createPathIgnoreMatcher, getConfigScopeKey, PathIgnoreMatcher, normalizeTraversalConcurrency } from './utils';
import { SocksClient } from "socks";
import { SocksProxyType } from "socks/typings/common/constants";
import { getContext } from "./config/globals";
import { Mutex } from 'async-mutex';
import { addLogTask, updateTaskProgress } from './output';
import { ClientConnectionError } from './types/connect';
import { myEvent } from './events/myEvent';
import { StatusBarUi } from './statusBar';
import { getDecryptionCode } from "./CodeLensProvider";
import { cloneTask } from "./task";
import { FileTransferClient, FTPClientType, FTPProgressHandler, FTPRemoteFileInfo, isFTPClient, isSFTPClient, SFTPClientType } from "./types/client";
import { clearWatchCache } from "./watchCache";

EventEmitter.setMaxListeners(99999)

type FtpFileTimeTargetMode = 'quotedPath' | 'rawPath' | 'quotedFileName' | 'fileName';

type FtpFileTimeStrategy = {
    commandIndex: number;
    targetMode: FtpFileTimeTargetMode;
    useCwd: boolean;
};

type DownloadTraversalDirectory = {
    remotePath: string;
    localPath: string;
};

type DownloadTraversalEntry = {
    name: string;
    isDirectory: boolean;
};

class ConnectionLimiter {
    private active = 0;
    private waiters: Array<(release: () => void) => void> = [];

    constructor(private limit: number) { }

    setLimit(limit: number) {
        this.limit = Math.max(1, limit);
        this.dispatch();
    }

    async acquire(wait: boolean = true): Promise<(() => void) | undefined> {
        if (this.active < this.limit) {
            this.active++;
            return this.createRelease();
        }
        if (!wait) return undefined;
        return new Promise(resolve => this.waiters.push(resolve));
    }

    private createRelease() {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.active--;
            this.dispatch();
        };
    }

    private dispatch() {
        while (this.active < this.limit && this.waiters.length) {
            const resolve = this.waiters.shift();
            if (!resolve) break;
            this.active++;
            resolve(this.createRelease());
        }
    }
}

// 文件传输类
export default class FileTransfer extends EventEmitter {
    static instance: FileTransfer;
    static ftpConnectionPools: { [key: string]: FTPClientType[] } = {}; // ftp连接池
    static sftpConnectionPools: { [key: string]: SFTPClientType[] } = {}; // sftp连接池
    static queues: { [key: string]: async.QueueObject<Task> } = {}; // 用于存储每个 configItem.name 的任务队列
    static maxConnectionsMap: { [key: string]: number } = {}; // 存储每个 configItem.name 对应的并发数量
    static collectionOfTreeNodes: { [key: string]: string } = {}; // 存储需要刷新的树节点的集合
    static noUploadFiles: Set<string> = new Set<string>(); // 存储不上传的文件
    static concurrencyProbeInFlight: { [key: string]: Promise<void> | undefined } = {};
    static concurrencyProbeLastStartedAt: { [key: string]: number } = {};
    static concurrencyProbeCooldownMs = 2000;
    static taskMaxRetries = 3;
    static taskRetryDelayMs = 2000;
    static ftpFileTimeStrategyCache: { [key: string]: FtpFileTimeStrategy } = {};
    static queueConfigs: { [key: string]: FileTransferConfigItem } = {};
    static queueOwners: { [key: string]: FileTransfer } = {};
    static queueTerminalStates: { [key: string]: TaskTerminalState | undefined } = {};
    static finalizedQueues: Set<string> = new Set();
    static connectionLimiters = new Map<string, ConnectionLimiter>();
    static clientLeaseReleases = new WeakMap<object, () => void>();

    configItem: FileTransferConfigItem; // 配置项
    uploadTaskNumber: number; // 上传数量达到多少时开启并发
    maxConnections: number; // 最大连接数
    rootPath: string
    context: vscode.ExtensionContext;
    mutex: Mutex;  // 定义互斥锁
    static timer: ReturnType<typeof setInterval> | null = null; // 定时器
    // 已创建的目录集合，用于判断是否已创建过该目录
    existCreateDir: { [key: string]: Set<string> } = {};
    existCreateDirPending: { [key: string]: Map<string, Promise<void>> } = {};
    existFileSize: { [x: string]: number; } = {}

    // 构造函数
    constructor(configItem: FileTransferConfigItem) {
        super();

        let syncConfig = getPluginSetting()
        let uploadTaskNumber = syncConfig.get('uploadTaskNumber', 10)
        let uploadConcurrentLimit = syncConfig.get('uploadConcurrentLimit', 3)
        this.configItem = configItem;
        this.rootPath = configItem.workspaceRoot || getRootPath();
        this.configItem.workspaceRoot = this.rootPath;
        const scopeKey = getConfigScopeKey(this.configItem);
        this.uploadTaskNumber = uploadTaskNumber;
        this.maxConnections = uploadConcurrentLimit;
        this.context = getContext();
        // this.setMaxListeners(999);
        this.mutex = new Mutex();  // 初始化锁
        // 确保共享实例
        FileTransfer.instance = this;
        this.existCreateDir[scopeKey] = new Set();
        this.existCreateDirPending[scopeKey] = new Map();
        FileTransfer.queueConfigs[scopeKey] = this.configItem;

        // 初始化连接池
        if (!FileTransfer.ftpConnectionPools[scopeKey]) {
            FileTransfer.ftpConnectionPools[scopeKey] = [];
        }
        if (!FileTransfer.sftpConnectionPools[scopeKey]) {
            FileTransfer.sftpConnectionPools[scopeKey] = [];
        }

        FileTransfer.startCleanupTimer()

        // 初始化最大并发数
        if (!FileTransfer.maxConnectionsMap[scopeKey]) {
            FileTransfer.maxConnectionsMap[scopeKey] = 1; // 默认并发数
        }

        // 初始化队列
        // 如果当前 configItem.name 没有对应的队列，则创建新的队列
        if (!FileTransfer.queues[scopeKey]) {
            FileTransfer.queueOwners[scopeKey] = this;
            FileTransfer.queues[scopeKey] = async.queue(async (task: Task, callback) => {
                let client: FileTransferClient | undefined;
                const maxRetries = FileTransfer.taskMaxRetries;  // 每个任务的最大重试次数

                // 定义任务执行的函数
                const executeTask = async (task: Task) => {
                    try {
						if (task.operationType === 'upload' && !fs.existsSync(task.localPath)) {
							oConsole.log(`[skip] ${l10n.t('Local file {0} does not exist', task.localPath)}`);
							task.progress = 100;
							task.error = '';
							updateTaskProgress();
							callback && callback();
							return;
						}
                        client = await this.getClient(task.config);
                        if (task.config.type === 'ftp' && isFTPClient(client)) await client.cd("/")
                        this.configItem = task.config;
                        this.addTaskLog(task)

                        // 如果是对比文件，且远程不存在该文件，则不执行对比
                        if (task.compare && !task.isDirectory && task.operationType === 'download') {
                            let msg = l10n.t('Remote file does not exist')
                            task.remotePath = getNormalPath(task.remotePath);

                            let res = true
                            if (task.config.type === 'ftp') {
                                res = await this.existFTPFile(client as FTPClientType, task.remotePath)
                            } else if (isSFTPClient(client)) {
                                res = Boolean(await client.exists(task.remotePath))
                            }
                            if (!res) {
                                task.error = msg
                                FileTransfer.queueTerminalStates[getConfigScopeKey(task.config)] = 'failed';
                                let msg2 = `[compare][${task.config.name}][${task.config.type}][error]：${task.remotePath} ${msg}`;
                                vscode.window.showErrorMessage(msg2);
                                await this.releaseClient(client, task.config);
                                client = undefined;
                                updateTaskProgress();
                                callback && callback();  // 任务完成，调用回调
                                return
                            }
                        }

                        // skipIfSame: 上傳前檢查遠端檔案是否相同，相同則跳過
                        if (task.operationType === 'upload' && !task.isDirectory && task.localPath && fs.existsSync(task.localPath)) {
                            const fileStat = fs.statSync(task.localPath);
                            if (fileStat.isFile()) {
                                const normalizedRemotePath = getNormalPath(task.remotePath);
                                if (await this.shouldSkipUpload(client, task, normalizedRemotePath)) {
                                    await this.releaseClient(client, task.config);
                                    client = undefined;
                                    this.addMaxConcurrency(task.config);
                                    callback && callback();
                                    return;
                                }
                            }
                        }

                        // 根据任务类型决定执行何种操作
                        switch (task.operationType) {
                            case 'upload':
                                await this.uploadFile(client, task);
                                break;
                            case 'download':
                                await this.downloadFile(client, task);
                                break;
                            case 'delete':
                                await this.deleteFile(client, task);
                                break;
                            case 'rename':
                                await this.renameFile(client, task);
                                break;
                            default:
								throw new Error(`[operation:unknown] ${task.operationType}`);
                        }

                        // 释放连接
                        await this.releaseClient(client, task.config);
                        client = undefined;
                        task.error = ''
                        updateTaskProgress();

                        // 视图上传需要刷新的视图菜单树节点
                        if (task.operationType !== 'download') {
                            const key = `${getConfigScopeKey(task.config)}###${task.remotePath}`;
                            myEvent.fire({
                                nodePath: key,
                                task: task,
                                type: 'refreshNode',
                            });
                        }

                        if (task.compare && !task.isDirectory) {
                            let localPath = path.join(this.rootPath, path.relative(task.config.type == 'ftp' ? "/" : task.config.remotePath, task.remotePath))
                            // 执行对比命令
                            vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(task.localPath), vscode.Uri.file(localPath), `${l10n.t('Local file')} ↔ ${l10n.t('Remote file')}: ${path.relative(this.rootPath, localPath)}`);
                        }

                        // 动态增加并发数
                        this.addMaxConcurrency(task.config)

                        callback && callback();  // 任务完成，调用回调
                    } catch (err) {
                        // 释放连接
                        if (client) {
                            await this.releaseClient(client, task.config);
                            client = undefined;
                        }

                        let msg = '[error]'
                        if (err instanceof ClientConnectionError) {
                            task.error = `${err.message}`
                            updateTaskProgress();
                            await FileTransfer.changeAsyncStatus(task.config, 'stop', 'failed')
                            callback && callback();  // 任务失敗，呼叫回調
                        } else {
                            task.retries ? task.retries++ : task.retries = 1;  // 增加重试次数
                            // console.error(`Error during ${task.operationType} of ${task.localPath} to ${task.remotePath}:`, err);
                            if (task.retries < maxRetries) {
								oConsole.log(`${l10n.t('Retry')} (${task.retries}/${maxRetries})`);
                                msg = `[${l10n.t('Retry')} (${task.retries}/${maxRetries})] ${err}`
                                task.error = `${msg}`
                                updateTaskProgress();
                                await sleep(FileTransfer.taskRetryDelayMs);
                                await executeTask(task);  // 递归调用以进行重试
                            } else {
								task.error = `${err}`
                                updateTaskProgress();

                                // 退出任务
                                await FileTransfer.changeAsyncStatus(task.config, 'stop', 'failed')

                                callback && callback();  // 任务失败，调用回调
                            }
                        }
                    }
                };

                // 执行任务
                await executeTask(task);
            }, FileTransfer.maxConnectionsMap[scopeKey]);

            // 所有任務完成時統一進行 config-level finalize。
            FileTransfer.queues[scopeKey].drain(() => {
                const terminalState = FileTransfer.queueTerminalStates[scopeKey] || 'completed';
                const latestConfig = FileTransfer.queueConfigs[scopeKey] || configItem;
                void this.finalizeQueue(latestConfig, terminalState);
            });

        }
    }

    async finalizeQueue(configItem: FileTransferConfigItem, terminalState: TaskTerminalState) {
        const scopeKey = getConfigScopeKey(configItem);
        if (FileTransfer.finalizedQueues.has(scopeKey)) return;
        FileTransfer.finalizedQueues.add(scopeKey);
        FileTransfer.queueTerminalStates[scopeKey] = terminalState;

        let cleanupError: unknown;
        try {
            this.existCreateDir[scopeKey]?.clear();
            this.existCreateDirPending[scopeKey]?.clear();
            if (configItem.watch) {
                await this.clearCache(configItem);
            }
        } catch (err) {
            cleanupError = err;
        } finally {
            const stateText = terminalState === 'completed'
                ? l10n.t('All tasks completed')
                : terminalState;
            StatusBarUi.working(`${[configItem.name]} ${stateText}`);
            myEvent.fire({
                name: configItem.name,
                workspaceRoot: configItem.workspaceRoot,
                status: 'complete_sync',
                terminalState,
                type: 'refreshSyncStatus',
            });

            if (cleanupError) {
				oConsole.error(`[${configItem.name}][queue:cleanup][error] ${cleanupError}`);
            }

        }
    }

    allTaskCompleted(configItem: FileTransferConfigItem) {
        return this.finalizeQueue(configItem, 'completed');
    }

    checkAllTaskCompleted() {
        let flag = true
        for (const [, queue] of Object.entries(FileTransfer.queues)) {
            if (queue.length() !== 0 || queue.running() !== 0) {
                flag = false;
            }
        }
        return flag
    }


    addTaskLog(task: Task) {
        if (task.isDirectory && task.operationType && ['upload', 'download'].includes(task.operationType)) return
        if (!task.start) task.start = dayjs().format('YYYY-MM-DD HH:mm:ss');
        if (task.progress === undefined) task.progress = 0;
        addLogTask(task);
    }

    // 启动清理定时器，只启动一次
    static startCleanupTimer() {
        FileTransfer.timer && clearInterval(FileTransfer.timer);
        FileTransfer.timer = setInterval(async () => {
            for (const [k, v] of Object.entries(FileTransfer.queues)) {
                // 如果任务队列不为空，则跳过清理
                if (v.length() !== 0) {
                    continue;
                }
				// 循环清理所有 FTP 连接池
                await FileTransfer.cleanupConnectionPool(FileTransfer.ftpConnectionPools[k], 'ftp' as TargetTypes);
                // 循环清理所有 SFTP 连接池
                await FileTransfer.cleanupConnectionPool(FileTransfer.sftpConnectionPools[k], 'sftp' as TargetTypes);
            }
        }, 60 * 1000); // 每分钟清理
    }

    // 清理连接池，判断连接是否可用，再移除
    static async cleanupConnectionPool(
        pool: FTPClientType[] | SFTPClientType[],
        type: TargetTypes,
        maxIdle: number = Infinity
    ): Promise<void> {
        // 先移除超出闲置上限的多余连线（从尾端开始移除最旧的）
        while (pool.length > maxIdle) {
            const excess = pool.shift();
            if (excess) {
                try {
                    if (type === TargetTypes.ftp) {
                        (excess as FTPClientType).close();
                    } else {
                        await (excess as SFTPClientType).end();
                    }
                } catch { /* connection already dead, safe to ignore */ }
            }
        }

        for (let i = pool.length - 1; i >= 0; i--) {
            const client = pool[i];
            try {
                // 检查 FTP 或 SFTP 连接是否仍然活跃
                await (type === TargetTypes.ftp ? (client as FTPClientType).pwd() : (client as SFTPClientType).cwd());
			} catch (err) {
                // 如果检测失败，说明连接不可用，移除连接
				pool.splice(i, 1);
                try {
                    if (type === TargetTypes.ftp) {
                        (client as FTPClientType).close();
                    } else {
                        await (client as SFTPClientType).end();
                    }
                } catch { /* connection already closed or broken, safe to ignore */ }
            }
        }
    }

    // 获取连接
    async getClient(config: FileTransferConfigItem, showErr?: boolean, waitForLease?: true): Promise<FileTransferClient>;
    async getClient(config: FileTransferConfigItem, showErr: boolean, waitForLease: false): Promise<FileTransferClient | undefined>;
    async getClient(
        config: FileTransferConfigItem,
        showErr: boolean = false,
        waitForLease: boolean = true
    ): Promise<FileTransferClient | undefined> {
        const pool = config.type === 'ftp' ? FileTransfer.ftpConnectionPools : FileTransfer.sftpConnectionPools;
        const scopeKey = getConfigScopeKey(config);
        let limiter = FileTransfer.connectionLimiters.get(scopeKey);
        if (!limiter) {
            limiter = new ConnectionLimiter(this.maxConnections);
            FileTransfer.connectionLimiters.set(scopeKey, limiter);
        } else {
            limiter.setLimit(this.maxConnections);
        }
        const releaseLease = await limiter.acquire(waitForLease);
        if (!releaseLease) return undefined;
        const scopedPool = pool[scopeKey] || (pool[scopeKey] = []);
        let client: FileTransferClient | undefined = scopedPool.pop();

        if (!client) {
            try {
                const { sock: _existingSocket, ...configWithoutSocket } = config;
                const configClone: FileTransferConfigItem = { ...configWithoutSocket };
                // 如果需要代理，通过 SocksClient 创建 socket
                if (configClone.proxy) {
                    const proxyConfig = getPluginSetting().get<proxyConfigType>("proxyConfig");
                    if (!proxyConfig || (!proxyConfig.proxyHost || !proxyConfig.proxyPort || ![4, 5].includes(proxyConfig.proxyType as SocksProxyType))) {
                        throw new Error(l10n.t('Please check if the proxy configuration is correct'));
                    }

                    try {
                        const { socket } = await SocksClient.createConnection({
                            proxy: {
                                host: proxyConfig.proxyHost,
                                port: proxyConfig.proxyPort,
                                userId: proxyConfig.proxyUsername,
                                password: proxyConfig.proxyPassword,
                                type: proxyConfig.proxyType as SocksProxyType,
                            },
                            command: "connect",
                            timeout: 10000,
                            destination: { host: configClone.host, port: configClone.port },
                        });

                        configClone.type === 'ftp'
                            ? (client = new ftp.Client({
                                useInitialHost: true,
                                buildSocket: () => proxySocket.create(proxyConfig.proxyHost, proxyConfig.proxyPort),
                            }) as FTPClientType)
                            : (configClone.sock = socket, client = new SftpClient() as SFTPClientType);
                    } catch (err) {
                        throw new Error(l10n.t('Proxy connection failed, please check configuration:') + err?.toString());
                    }
                } else {
                    client = configClone.type === 'ftp'
                        ? new ftp.Client() as FTPClientType
                        : new SftpClient() as SFTPClientType;
                }

                if (configClone.secretKeyPath && fs.existsSync(configClone.secretKeyPath)) {
                    let secretKey = fs.readFileSync(configClone.secretKeyPath, 'utf-8');
                    const decryptedUsername = getDecryptionCode(configClone.username, secretKey)
                    const decryptedPassword = getDecryptionCode(configClone.password, secretKey)
                    configClone.username = decryptedUsername ? decryptedUsername : configClone.username;
                    configClone.password = decryptedPassword ? decryptedPassword : configClone.password;
                }

                if (configClone.type !== 'ftp') {
                    const keyPath = typeof configClone.privateKeyPath === 'string' ? configClone.privateKeyPath.trim() : '';
                    const hasValidPrivateKey = Boolean(keyPath) && fs.existsSync(keyPath);

                    if (hasValidPrivateKey) {
                        configClone.privateKeyPath = keyPath;
                        configClone.password = undefined;
                    } else {
                        configClone.privateKeyPath = undefined;
                    }
                }

                if (configClone.type === 'ftp') {
                    if (!isFTPClient(client)) {
						throw new Error(l10n.t('Failed to connect: {0}', 'FTP'));
                    }
                    // 设置 FTP 用户名，并连接
                    configClone.user = configClone.username;
                    // 匹配IPv4地址的正则表达式
                    const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;
                    if (ipv4Pattern.test(configClone.host)) {
                        client.prepareTransfer = ftp.enterPassiveModeIPv4
                    }
                    // client.ftp.verbose = true;
                }

                if (configClone.type === 'ftp') {
                    await (client as FTPClientType).access(configClone);
                } else {
                    await (client as SFTPClientType).connect(configClone);
                }
            } catch (err) {
                // 清理连接防止内存泄漏
                if (client) {
                    try {
                        if (config.type === 'ftp') {
                            (client as FTPClientType).close();
                        } else {
                            await (client as SFTPClientType).end();
                        }
                    } catch { /* already closed or broken, safe to ignore */ }
                }

                // 显示错误信息
                if (showErr) {
                    vscode.window.showErrorMessage(`[${config.name}][${config.type}][error]: ${err?.toString()}`);
                }

                releaseLease();
                throw new ClientConnectionError(l10n.t('Failed to connect: {0}', `${err}`));
            }
        }

        FileTransfer.clientLeaseReleases.set(client as object, releaseLease);
        return client;
    }

    // 释放连接回连接池
    async releaseClient(client: FileTransferClient, config: FileTransferConfigItem, errorOccurred = false) {
        if (!client) return;
        const clientKey = client as object;
        const releaseLease = () => {
            const release = FileTransfer.clientLeaseReleases.get(clientKey);
            if (!release) return;
            FileTransfer.clientLeaseReleases.delete(clientKey);
            release();
        };
        if (errorOccurred) {
            releaseLease();
            return;
        }

        try {
            // 检查连接是否可用
            if (config.type === 'ftp') {
                await (client as FTPClientType).pwd();
            } else {
                await (client as SFTPClientType).cwd();
            }

            // 检查连接池是否已达闲置上限，超出则直接关闭而非放回
            const scopeKey = getConfigScopeKey(config);
            const pool = config.type === 'ftp'
                ? FileTransfer.ftpConnectionPools[scopeKey]
                : FileTransfer.sftpConnectionPools[scopeKey];

            if (pool.length >= this.maxConnections) {
				try {
                    if (config.type === 'ftp') {
                        (client as FTPClientType).close();
                    } else {
                        await (client as SFTPClientType).end();
                    }
                } catch { /* already closed, safe to ignore */ }
                releaseLease();
                return;
            }

            if (config.type === 'ftp') {
                FileTransfer.ftpConnectionPools[scopeKey].push(client as FTPClientType);
            } else {
                FileTransfer.sftpConnectionPools[scopeKey].push(client as SFTPClientType);
            }
        } catch (err) {
			try {
                if (config.type === 'ftp') {
                    (client as FTPClientType).close();
                } else {
                    await (client as SFTPClientType).end();
                }
            } catch { /* connection already dead, safe to ignore */ }
        }
        releaseLease();
    }


    // 上传文件
    /**
     * 檢查遠端檔案大小和修改時間是否與本地相同，相同則跳過上傳
     */
    private async shouldSkipUpload(client: FileTransferClient, task: Task, remotePath: string): Promise<boolean> {
        const { config } = task;
        if (!config.skipIfSame) return false;
        if (task.isDirectory || !task.localPath || !fs.existsSync(task.localPath)) return false;

        try {
            const localStat = fs.statSync(task.localPath);
            if (!localStat.isFile()) return false;

            const localSize = localStat.size;
            const localMtime = Math.floor(localStat.mtimeMs / 1000);
            const compareMode = config.skipCompareMode || 'size+mtime';

            let remoteSize: number | null = null;
            let remoteMtime: number | null = null;

            if (config.type === 'ftp') {
                const ftpClient = client as FTPClientType;
                // FTP: get size and mtime separately
                try {
                    remoteSize = await ftpClient.size(remotePath);
                } catch { remoteSize = null; }
                try {
                    const ftpDate = await ftpClient.lastMod(remotePath);
                    if (ftpDate instanceof Date) {
                        remoteMtime = Math.floor(ftpDate.getTime() / 1000);
                    }
                } catch { remoteMtime = null; }
            } else if (isSFTPClient(client)) {
                const sftpClient = client;
                // SFTP/SSH: stat returns both
                try {
                    const stat = await sftpClient.stat(remotePath);
                    if (stat) {
                        remoteSize = stat.size ?? null;
                        if (stat.modifyTime) {
                            remoteMtime = Math.floor(new Date(stat.modifyTime).getTime() / 1000);
                        }
                    }
                } catch { /* file doesn't exist */ }
            }

            let shouldSkip = false;
            switch (compareMode) {
                case 'size+mtime':
                    shouldSkip = remoteSize !== null && remoteMtime !== null && remoteSize === localSize && remoteMtime === localMtime;
                    break;
                case 'size':
                    shouldSkip = remoteSize !== null && remoteSize === localSize;
                    break;
                case 'mtime':
                    shouldSkip = remoteMtime !== null && remoteMtime === localMtime;
                    break;
            }

            if (shouldSkip) {
                const time = dayjs().format('YYYY-MM-DD HH:mm:ss');
                addLogTask(`[${time}][${config.name}][${config.type}][skipUpload]: ${remotePath} (size=${localSize}, mtime=${localMtime}, mode=${compareMode})`, config);
                return true;
            }
        } catch {
            // skip comparison failed (e.g. remote file not found or stat error), proceed with normal upload
        }
        return false;
    }

    async uploadFile(client: FileTransferClient, task: Task): Promise<void> {
        let { localPath, remotePath, config, useZip, isDirectory } = task;
		let fileStat: ReturnType<typeof fs.statSync>;
		try {
			fileStat = fs.statSync(task.localPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				oConsole.log(`[skip] ${l10n.t('Local file {0} does not exist', task.localPath)}`);
				return;
			}
			throw error;
		}
        task.fileSize = fileStat.size
        task.isDirectory = fileStat.isDirectory()
        task.fileSizeText = formatFileSize(task.fileSize)
		let remoteDirPath = path.dirname(remotePath);
		// 本機路徑確認存在後才允許建立遠端父目錄，避免 stale task 留下空目錄。
		await this.checkExistFolder(task.config, client, remoteDirPath)

        // skipIfSame: 已在 executeTask 中完成檢查，此處不再重複

        // 开始传输
        if (config.type === "ftp") {
            const ftpClient = client as FTPClientType;
            if (task.isDirectory) {
                await this.uploadFolder(task)
            } else {
                // FTP 无法上传 0 byte 档案，使用暂存档避免修改原始本地档案
                let uploadPath = localPath;
                let tempFile: string | null = null;
                if (task.fileSize === 0) {
                    tempFile = localPath + '.ftp_tmp';
                    fs.writeFileSync(tempFile, " ");
                    uploadPath = tempFile;
                }

                try {
                    const onProgress: FTPProgressHandler = (info) => {
                        if (info.type === 'upload') {
                            if (!task.fileSize) {
                                task.useTime = getUseTime(task.start)
                                task.progress = 100
                            } else {
                                const progress = Math.min(parseFloat(((info.bytes / task.fileSize) * 100).toFixed(2)), 100);
								task.progress = progress
                                if (progress >= 100 || !info.bytes) {
                                    task.useTime = getUseTime(task.start)
                                }
                            }
                            updateTaskProgress();
                        }
                    };
                    ftpClient.trackProgress(onProgress);
                    remotePath = getNormalPath(remotePath)
                    await ftpClient.uploadFrom(uploadPath, remotePath)
                    ftpClient.trackProgress()
                    await this.syncRemoteFileTime(ftpClient, task, remotePath)
                } finally {
                    // 清理暂存档
                    if (tempFile && fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                }
            }
        } else {
            const sftpClient = client as SFTPClientType;
            if (isDirectory) {
                await this.uploadFolder(task)
            } else {
                remotePath = getNormalPath(remotePath)
                await sftpClient.fastPut(task.localPath, remotePath, {
                    flags: "r+",
                    autoClose: true,
                    step: (transferred: number, _chunk: number, total: number) => {
                        // oConsole.log(`已传输 ${transferred}/${total} 字节`)
                        task.progress = Math.min(parseFloat(((transferred / total) * 100).toFixed(2)), 100);
                        // task.localPath.includes(this.rootPath) && updateUploadStatus(true, `${[task.operationType]}: ${path.relative(this.rootPath, task.localPath)} ${task.progress}%`)
                        if (task.progress >= 100 && !task.end) {
                            task.useTime = getUseTime(task.start)
                        }
                        updateTaskProgress();
                    }
                })
                await this.syncRemoteFileTime(sftpClient, task, remotePath)
            }
        }

        // 是否使用压缩上传
        if (useZip) {
            // 是否远程解压
            if (config.type == 'ssh' && task.config.remote_unpacked) {
                await this.UnzipFile(client as SFTPClientType, task.config, localPath, remotePath)
            }
            //是否删除远程压缩文件
            if (task.config.delete_remote_compress) {
                await this.deleteFile(client, task, false);
            }
            //删除本地压缩文件
            if (task.config.delete_local_compress && fs.existsSync(localPath)) {
                fs.unlinkSync(localPath)
            }
        }
    }

    private formatFtpMfmtTime(date: Date): string {
        const year = date.getUTCFullYear();
        const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
        const day = `${date.getUTCDate()}`.padStart(2, '0');
        const hour = `${date.getUTCHours()}`.padStart(2, '0');
        const minute = `${date.getUTCMinutes()}`.padStart(2, '0');
        const second = `${date.getUTCSeconds()}`.padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}${second}`;
    }

    private formatFtpUtimeLocal(date: Date): string {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        const hour = `${date.getHours()}`.padStart(2, '0');
        const minute = `${date.getMinutes()}`.padStart(2, '0');
        const second = `${date.getSeconds()}`.padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}${second}`;
    }

    private normalizeToSecond(date: Date): Date {
        return new Date(Math.floor(date.getTime() / 1000) * 1000);
    }

    private logSyncFileTime(task: Task, message: string) {
        const { config } = task;
        const time = dayjs().format('YYYY-MM-DD HH:mm:ss');
        addLogTask(`[${time}][${config.name}][${config.type}][syncFileTime]: ${message}`, config);
    }

    private getFtpFileTimeStrategyCacheKey(config: FileTransferConfigItem) {
        return `${config.name}###${config.host}###${config.port}###${config.type}`;
    }

    private buildFtpFileTimeCommands(targetPath: string, mfmtTime: string, utimeTime: string) {
        return [
            `MFMT ${mfmtTime} ${targetPath}`,
            `SITE MFMT ${mfmtTime} ${targetPath}`,
            `MDTM ${mfmtTime} ${targetPath}`,
            `SITE UTIME ${targetPath} ${utimeTime} ${utimeTime} ${utimeTime} UTC`,
            `SITE UTIME ${utimeTime} ${utimeTime} ${utimeTime} UTC ${targetPath}`,
            `SITE TOUCH ${utimeTime} ${targetPath}`,
        ];
    }

    private getFtpFileTimeTarget(
        mode: FtpFileTimeTargetMode,
        paths: { quotedPath: string; rawPath: string; quotedFileName: string; fileName: string }
    ) {
        return paths[mode];
    }

    private async applyRemoteFileTime(client: FileTransferClient, task: Task, remotePath: string, targetTime: Date) {
        const { config } = task;

        if (config.type === 'ftp') {
            const ftpClient = client as FTPClientType;

            const quotedPath = `"${remotePath.replace(/"/g, '""')}"`;
            const mfmtTime = this.formatFtpMfmtTime(targetTime);
            const utimeTime = this.formatFtpUtimeLocal(targetTime);

            const fileName = path.posix.basename(remotePath);
            const quotedFileName = `"${fileName.replace(/"/g, '""')}"`;
            const dirNameRaw = path.posix.dirname(remotePath);
            const dirName = !dirNameRaw || dirNameRaw === '.' ? '/' : dirNameRaw;
            const targetPaths = {
                quotedPath,
                rawPath: remotePath,
                quotedFileName,
                fileName,
            };
            const cacheKey = this.getFtpFileTimeStrategyCacheKey(config);
            const cachedStrategy = FileTransfer.ftpFileTimeStrategyCache[cacheKey];

            let lastErr: unknown;
            const errorLogs: string[] = [];

            if (cachedStrategy) {
                const targetPath = this.getFtpFileTimeTarget(cachedStrategy.targetMode, targetPaths);
                const command = this.buildFtpFileTimeCommands(targetPath, mfmtTime, utimeTime)[cachedStrategy.commandIndex];
                try {
                    if (cachedStrategy.useCwd) {
                        const originalDir = await ftpClient.pwd();
                        try {
                            await ftpClient.cd(dirName);
                            await ftpClient.send(command);
                            return;
                        } finally {
                            await ftpClient.cd(originalDir || '/');
                        }
                    }

                    await ftpClient.send(command);
                    return;
                } catch (err) {
                    delete FileTransfer.ftpFileTimeStrategyCache[cacheKey];
                    lastErr = err;
                    errorLogs.push(`[cached] ${command} => ${err}`);
                    this.logSyncFileTime(task, `cached ftp strategy failed, falling back to discovery: ${err}`);
                }
            }

            const tryCommand = async (strategy: FtpFileTimeStrategy) => {
                const targetPath = this.getFtpFileTimeTarget(strategy.targetMode, targetPaths);
                const command = this.buildFtpFileTimeCommands(targetPath, mfmtTime, utimeTime)[strategy.commandIndex];
                await ftpClient.send(command);
                FileTransfer.ftpFileTimeStrategyCache[cacheKey] = strategy;
            };

            const directTargetModes: FtpFileTimeTargetMode[] = ['quotedPath', 'rawPath'];
            for (const targetMode of directTargetModes) {
                const targetPath = this.getFtpFileTimeTarget(targetMode, targetPaths);
                const commands = this.buildFtpFileTimeCommands(targetPath, mfmtTime, utimeTime);
                for (let commandIndex = 0; commandIndex < commands.length; commandIndex++) {
                    try {
                        await tryCommand({ commandIndex, targetMode, useCwd: false });
                        return;
                    } catch (err) {
                        lastErr = err;
                        errorLogs.push(`${commands[commandIndex]} => ${err}`);
                    }
                }
            }

            {
                const originalDir = await ftpClient.pwd();
                try {
                    await ftpClient.cd(dirName);
                    const cwdTargetModes: FtpFileTimeTargetMode[] = ['quotedFileName', 'fileName'];
                    for (const targetMode of cwdTargetModes) {
                        const targetPath = this.getFtpFileTimeTarget(targetMode, targetPaths);
                        const commands = this.buildFtpFileTimeCommands(targetPath, mfmtTime, utimeTime);
                        for (let commandIndex = 0; commandIndex < commands.length; commandIndex++) {
                            try {
                                await tryCommand({ commandIndex, targetMode, useCwd: true });
                                return;
                            } catch (err) {
                                lastErr = err;
                                errorLogs.push(`[cwd:${dirName}] ${commands[commandIndex]} => ${err}`);
                            }
                        }
                    }
                } finally {
                    await ftpClient.cd(originalDir || '/');
                }
            }

			const summary = errorLogs.length
				? `[ftp:file-time][error] ${errorLogs.join(' | ')}`
				: `${lastErr}`;
            throw new Error(summary);
        }

        // SFTP: try underlying sftp.utimes first, then exec touch
        if (config.type === 'sftp') {
            const sftpClient = client as SFTPClientType;
            // Try underlying ssh2 SFTP utimes (client.sftp is the raw SFTP handle)
            if (sftpClient.sftp?.utimes) {
                try {
                    const epochSeconds = Math.floor(targetTime.getTime() / 1000);
                    await new Promise<void>((resolve, reject) => {
                        sftpClient.sftp?.utimes(remotePath, epochSeconds, epochSeconds, (err: Error | null | undefined) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    return;
                } catch (e) {
                    this.logSyncFileTime(task, `sftp.utimes failed: ${e}, trying exec touch...`);
                }
            }
            // Fallback: exec touch via SSH channel
            const epochSeconds = Math.floor(targetTime.getTime() / 1000);
            const escapedPath = remotePath.replace(/'/g, `'"'"'`);
            await sftpClient.exec(`touch -m -d @${epochSeconds} '${escapedPath}'`);
            return;
        }

        // SSH type
        if (config.type === 'ssh') {
            const sftpClient = client as SFTPClientType;
            const epochSeconds = Math.floor(targetTime.getTime() / 1000);
            const escapedPath = remotePath.replace(/'/g, `'"'"'`);
            await sftpClient.exec(`touch -m -d @${epochSeconds} '${escapedPath}'`);
        }
    }

    private async getRemoteFileTime(client: FileTransferClient, task: Task, remotePath: string): Promise<Date | null> {
        const { config } = task;

        try {
            if (config.type === 'ftp') {
                const ftpClient = client as FTPClientType;
                const ftpDate = await ftpClient.lastMod(remotePath);
                if (ftpDate instanceof Date) {
                    return this.normalizeToSecond(ftpDate);
                }
                return null;
            }

            const sftpClient = client as SFTPClientType;
            const stat = await sftpClient.stat(remotePath);
            if (stat?.modifyTime) {
                return this.normalizeToSecond(new Date(stat.modifyTime));
            }

            if (config.type === 'ssh' || config.type === 'sftp') {
                const escapedPath = remotePath.replace(/'/g, `'"'"'`);
                const result = await sftpClient.exec(`stat -c %Y '${escapedPath}'`);
                const epoch = Number((result?.stdout || '').toString().trim());
                if (!Number.isNaN(epoch) && epoch > 0) {
                    return new Date(epoch * 1000);
                }
            }
        } catch {
            return null;
        }

        return null;
    }

    async syncRemoteFileTime(client: FileTransferClient, task: Task, remotePath: string) {
        const { config, localPath } = task;
        if (!config.syncFileTime || task.isDirectory || !localPath || !fs.existsSync(localPath)) {
            return;
        }

        try {
            const localStat = fs.statSync(localPath);
            if (!localStat.isFile()) {
                return;
            }

            const targetTime = this.normalizeToSecond(localStat.mtime);
            await this.applyRemoteFileTime(client, task, remotePath, targetTime);

            const remoteTime = await this.getRemoteFileTime(client, task, remotePath);
            if (!remoteTime) {
                return;
            }

            const deltaMs = remoteTime.getTime() - targetTime.getTime();
            if (Math.abs(deltaMs) <= 1000) {
                return;
            }

            const correctedTime = this.normalizeToSecond(new Date(targetTime.getTime() - deltaMs));
            await this.applyRemoteFileTime(client, task, remotePath, correctedTime);

            const verifyTime = await this.getRemoteFileTime(client, task, remotePath);
            if (verifyTime) {
                const finalDeltaMs = verifyTime.getTime() - targetTime.getTime();
                if (Math.abs(finalDeltaMs) > 1000) {
                    this.logSyncFileTime(task, `${remotePath} remaining delta ${finalDeltaMs}ms (local=${targetTime.toISOString()}, remote=${verifyTime.toISOString()})`);
                }
            }
        } catch (err) {
            this.logSyncFileTime(task, `${remotePath} failed: ${err}`);
        }
    }

    async uploadFolder(task: Task) {
        let { localPath, remotePath, view } = task;
        let files = await getAllowFiles(
            task.config,
            localPath,
            view
        )
        if (files && files.length) {
            const tasks = files.map(vv => {
                let remoteFile = path.posix.join("/", remotePath, posixRelative(localPath, vv))
                return cloneTask(task, {
                    operationType: "upload",
                    localPath: vv,
                    view,
                    isDirectory: false,
                    remotePath: remoteFile
                });
            })
            await FileTransfer.addTasks(tasks)
        }
    }


    // 解压远程文件
    UnzipFile(client: SFTPClientType, config: FileTransferConfigItem, localPath: string, remotePath: string) {
        return new Promise<void>((resolve, reject) => {
            client
                .exec(`unzip -o ${remotePath} -d ${config.remotePath}`)
                .then(async (v) => {
                    if (!v.code) {
                        resolve()
                    } else {
                        reject(`${l10n.t('Decompression failed')}: ${v}`)
                    }
                }).catch((err: unknown) => {
					oConsole.error(`${l10n.t('Decompression failed')}: ${remotePath}`, err);
                    reject(`${l10n.t('Decompression failed')}: ${remotePath}`)
                });
        });
    }


    private getDownloadIgnoreMatcher(config: FileTransferConfigItem): PathIgnoreMatcher {
        const rules = Array.isArray(config.downloadExcludePath)
            ? config.downloadExcludePath
            : config.downloadExcludePath?.split(",").map(rule => rule.trim()).filter(Boolean) || [];
        const remoteRoot = config.type === "ftp" ? "/" : config.remotePath;
        return createPathIgnoreMatcher(rules, getNormalPath(remoteRoot));
    }

    private async listDownloadDirectory(
        client: FileTransferClient,
        config: FileTransferConfigItem,
        remotePath: string
    ): Promise<DownloadTraversalEntry[]> {
        if (config.type === 'ftp') {
            const list = await (client as FTPClientType).list(remotePath);
            return list.map(item => ({ name: item.name, isDirectory: item.isDirectory }));
        }
        const list = await (client as SFTPClientType).list(remotePath);
        return list.map(item => ({ name: item.name, isDirectory: item.type === 'd' }));
    }

    private async downloadFilesWithBoundedTraversal(
        initialClient: FileTransferClient,
        remotePath: string,
        localPath: string,
        task: Task,
        ignoreMatcher: PathIgnoreMatcher
    ) {
        const requestedConcurrency = normalizeTraversalConcurrency(task.config.downloadTraversalConcurrency, 2);
        const concurrency = Math.min(requestedConcurrency, Math.max(1, this.maxConnections));
        const clients: FileTransferClient[] = [initialClient];

        try {
            for (let i = 1; i < concurrency; i++) {
                const client = await this.getClient(task.config, false, false);
                if (!client) break;
                clients.push(client);
                if (task.config.type === 'ftp') await (client as FTPClientType).cd('/');
            }

            const directoryEntries = new Map<string, DownloadTraversalEntry[]>();
            let frontier: DownloadTraversalDirectory[] = [{ remotePath, localPath }];

            while (frontier.length) {
                const nextFrontier: DownloadTraversalDirectory[] = [];
                for (let offset = 0; offset < frontier.length; offset += clients.length) {
                    const batch = frontier.slice(offset, offset + clients.length);
                    const listedDirectories = await Promise.all(batch.map((directory, index) =>
                        this.listDownloadDirectory(clients[index], task.config, directory.remotePath)
                    ));

                    for (let index = 0; index < batch.length; index++) {
                        const directory = batch[index];
                        const entries = listedDirectories[index].filter(entry => {
                            const childPath = path.posix.join(directory.remotePath, entry.name);
                            return entry.isDirectory
                                ? ignoreMatcher.shouldTraverse(childPath)
                                : !ignoreMatcher.isIgnored(childPath);
                        });
                        directoryEntries.set(directory.remotePath, entries);
                        for (const entry of entries) {
                            if (!entry.isDirectory) continue;
                            nextFrontier.push({
                                remotePath: path.posix.join(directory.remotePath, entry.name),
                                localPath: path.join(directory.localPath, entry.name)
                            });
                        }
                    }
                }
                frontier = nextFrontier;
            }

            const downloadTasks: Task[] = [];
            const appendDirectoryTasks = (directory: DownloadTraversalDirectory) => {
                for (const entry of directoryEntries.get(directory.remotePath) || []) {
                    const childRemotePath = path.posix.join(directory.remotePath, entry.name);
                    const childLocalPath = path.join(directory.localPath, entry.name);
                    if (entry.isDirectory) {
                        appendDirectoryTasks({ remotePath: childRemotePath, localPath: childLocalPath });
                    } else {
                        downloadTasks.push(cloneTask(task, {
                            localPath: childLocalPath,
                            remotePath: childRemotePath,
                            operationType: 'download',
                            isDirectory: false
                        }));
                    }
                }
            };
            appendDirectoryTasks({ remotePath, localPath });
            await FileTransfer.addTasks(downloadTasks);
        } finally {
            for (const client of clients.slice(1)) {
                await this.releaseClient(client, task.config);
            }
        }
    }

    // 下载任务
    async downloadFile(client: FileTransferClient, task: Task) {
        let { localPath, remotePath, config } = task;
        const ignoreMatcher = this.getDownloadIgnoreMatcher(config);

        try {
            if (task.isDirectory) {
                if (!ignoreMatcher.shouldTraverse(remotePath)) return;
                if (normalizeTraversalConcurrency(config.downloadTraversalConcurrency, 2) > 1) {
                    await this.downloadFilesWithBoundedTraversal(client, remotePath, localPath, task, ignoreMatcher)
                } else if (config.type === "ftp") {
                    await this.downloadFilesFromFTP(client as FTPClientType, remotePath, localPath, task, ignoreMatcher)
                } else {
                    await this.downloadFilesFromSFTP(client as SFTPClientType, remotePath, localPath, task, ignoreMatcher)
                }
            } else {
                if (ignoreMatcher.isIgnored(remotePath)) return;
                // 检查本地文件夹是否存在
                let dirName = path.dirname(task.localPath)
                if (!fs.existsSync(dirName)) {
                    fs.mkdirSync(dirName, { recursive: true });
                }

                task.remotePath = getNormalPath(task.remotePath)


                FileTransfer.noUploadFiles.add(localPath)
                if (config.type === "ftp") {
                    const ftpClient = client as FTPClientType;
                    // 下载文件
                    const fileSize = await ftpClient.size(task.remotePath);
                    const onProgress: FTPProgressHandler = (info) => {
                        if (info.type === 'download') {
                            if (!fileSize) {
                                task.useTime = getUseTime(task.start)
                                task.progress = 100
                                setTimeout(() => {
                                    FileTransfer.noUploadFiles.delete(localPath)
                                }, 3000);
                            } else {
                                const progress = Math.min(parseFloat(((info.bytes / fileSize) * 100).toFixed(2)), 100);
								task.progress = progress
                                if (progress >= 100 || !info.bytes) {
                                    delete this.existFileSize[info.name]
                                    task.useTime = getUseTime(task.start)
                                    setTimeout(() => {
                                        FileTransfer.noUploadFiles.delete(localPath)
                                    }, 3000);
                                }
                            }
                            updateTaskProgress();
                        }
                    };
                    ftpClient.trackProgress(onProgress);
                    await ftpClient.downloadTo(task.localPath, task.remotePath);
                    ftpClient.trackProgress()
                } else {
                    const sftpClient = client as SFTPClientType;
                    // 下载文件
                    await sftpClient.fastGet(task.remotePath, task.localPath, {
                        step: (transferred: number, _chunk: number, total: number) => {
							let progress = Math.min(parseFloat(((transferred / total) * 100).toFixed(2)), 100);
                            task.progress = progress
                            if (progress >= 100) {
                                task.useTime = getUseTime(task.start)
                                setTimeout(() => {
                                    FileTransfer.noUploadFiles.delete(localPath)
                                }, 3000);
                            }
                            updateTaskProgress();
                        }
                    });
                }
            }
        } catch (err) {
			throw err;
        }
    }


    async downloadFilesFromFTP(
        client: FTPClientType,
        remotePath: string,
        localPath: string,
        task: Task,
        ignoreMatcher: PathIgnoreMatcher = this.getDownloadIgnoreMatcher(task.config)
    ) {
        try {
            if (!ignoreMatcher.shouldTraverse(remotePath)) return;
            const list = await client.list(remotePath); // 列出远程文件
            for (const item of list) {
                let remoteFilePath = path.posix.join(remotePath, item.name);
                const localFilePath = path.join(localPath, item.name);

                if (item.isDirectory) {
                    if (!ignoreMatcher.shouldTraverse(remoteFilePath)) continue;
                    // 递歸處理子目錄
                    await this.downloadFilesFromFTP(client, remoteFilePath, localFilePath, task, ignoreMatcher);
                } else {
                    if (ignoreMatcher.isIgnored(remoteFilePath)) continue;
                    const obj = cloneTask(task, {
                        localPath: localFilePath,
                        remotePath: remoteFilePath,
                        operationType: "download",
                        isDirectory: false
                    });
                    FileTransfer.addTask(obj)
                }
            }
        } catch (err) {
			throw err;
        }
    }

    async downloadFilesFromSFTP(
        client: SFTPClientType,
        remotePath: string,
        localPath: string,
        task: Task,
        ignoreMatcher: PathIgnoreMatcher = this.getDownloadIgnoreMatcher(task.config)
    ) {
        try {
            if (!ignoreMatcher.shouldTraverse(remotePath)) return;
            const list = await client.list(remotePath); // 列出远程文件
            for (const item of list) {
                let remoteFilePath = path.posix.join(remotePath, item.name);
                const localFilePath = path.join(localPath, item.name);

                if (item.type === 'd') { // 检查是否是目录
                    if (!ignoreMatcher.shouldTraverse(remoteFilePath)) continue;
                    // 递歸處理子目錄
                    await this.downloadFilesFromSFTP(client, remoteFilePath, localFilePath, task, ignoreMatcher);
                } else {
                    if (ignoreMatcher.isIgnored(remoteFilePath)) continue;
                    const obj = cloneTask(task, {
                        localPath: localFilePath,
                        remotePath: remoteFilePath,
                        operationType: "download",
                        isDirectory: false
                    });
                    FileTransfer.addTask(obj)
                }
            }
        } catch (err) {
			throw err;
        }
    }

    async existFTPFile(client: FTPClientType, remotePath: string) {
        let exists = false
        try {
            let dirname = getNormalPath(path.dirname(remotePath));
            let res: FTPRemoteFileInfo[] = await client.list(dirname)
            if (res.filter((v) => v.name === path.basename(remotePath)).length === 1) {
                exists = true
            }
        } catch (err) {
            exists = false
        }
        return exists
    }

    // 重命名任务
    async renameFile(client: FileTransferClient, task: Task, from: boolean = true) {
        let { localPath: oldPath, remotePath: newPath, config, fileType } = task;
        if (!oldPath || !newPath) return

        try {
            let { up_to_root, remotePath: newRemotePath } = isUpRoot(task.config, newPath, this.rootPath)
            let { remotePath: oldRemotePath } = isUpRoot(task.config, oldPath, this.rootPath)
            if (from && up_to_root) {
                newPath = newRemotePath
                oldPath = oldRemotePath
            }

            if (config.type !== "ftp") {
                oldPath = getNormalPath(oldPath)
                newPath = getNormalPath(newPath)
            }

            let exists = false
            // 检查文件是否存在
            if (config.type === "ftp") {
                const ftpClient = client as FTPClientType;
                oldPath = path.posix.join("/", oldPath)
                newPath = path.posix.join("/", newPath)
                exists = await this.existFTPFile(ftpClient, oldPath)
            } else {
                const sftpClient = client as SFTPClientType;
                exists = Boolean(await sftpClient.exists(oldPath));
            }
            if (exists) {
                //存在直接重命名
                await client.rename(oldPath, newPath);
                task.progress = 100
                task.useTime = getUseTime(task.start)
            } else {
                //不存在则上传
                let localPath = task.localPath
                if (!fs.existsSync(task.localPath)) {
                    localPath = path.posix.join(
                        this.rootPath,
                        path.relative(config.type == 'ftp' ? "" : task.config.remotePath, newPath)
                    )
                }
                // 判断是文件还是文件夹
                if (fileType == 'directory') {
                    task.localPath = localPath
                    await this.uploadFolder(task)
                } else {
                    //判断文件夹是否存在
                    let dirName = path.dirname(newPath)
                    dirName = config.type == 'ftp' ? path.posix.join("/", dirName) : dirName
                    await this.checkExistFolder(task.config, client, dirName)

                    const newTask = cloneTask(task, {
                        localPath,
                        remotePath: config.type == 'ftp' ? path.posix.join("/", newPath) : newPath,
                        operationType: "upload"
                    });
                    FileTransfer.addTask(newTask)
                }
            }
            return
        } catch (err) {
			throw err;
        }
    }

    // 删除任务
    async deleteFile(client: FileTransferClient, task: Task, from: boolean = true) {
        let { remotePath, config } = task;
        try {
            let { up_to_root, remotePath: newRemotePath } = isUpRoot(this.configItem, remotePath, this.rootPath)
            if (from && up_to_root) {
                remotePath = newRemotePath
            }
            remotePath = getNormalPath(remotePath)
            if (config.type === "ftp") {
                const ftpClient = client as FTPClientType;
                let basename = path.basename(remotePath)
                // 判断basename中是否包含空格
                let dirname = path.dirname(remotePath)

                basename = getNormalPath(basename)
                dirname = getNormalPath(dirname)
                if (basename == ".") {
                    await ftpClient.removeDir(remotePath)
                } else {
                    if (/\s/.test(basename)) {
                        await ftpClient.cd(dirname)
                        let files = await ftpClient.list()
                        for (const v of files) {
                            if (v.name == basename) {
                                if (v.type == 1) {
                                    await ftpClient.remove(basename)
                                }
                                if (v.type == 2) {
                                    await ftpClient.removeDir(basename)
                                }
                            }
                        }
                        await ftpClient.cd("/")
                    } else {
                        let files = await ftpClient.list(dirname)
                        if (files.length) {
                            for (let v of files) {
                                if (v.name == basename) {
                                    // type 0 Unknown 1 File 2 Directory 3 SymbolicLink
                                    if (v.type == 1) {
                                        await ftpClient.remove(remotePath)
                                    }
                                    if (v.type == 2) {
                                        await ftpClient.removeDir(remotePath)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                const sftpClient = client as SFTPClientType;
                const res = await sftpClient.exists(remotePath);
                // 判断是文件还是文件夹
                if (res) {
                    if (res == "-") {
                        await sftpClient.delete(remotePath)
                    } else if (res == "d") {
                        await sftpClient.rmdir(remotePath, true)
                    }
                }
            }
            task.progress = 100
            task.useTime = getUseTime(task.start)
            return
        } catch (err) {
			throw err;
        }
    }


    // 动态增加并发数
    async addMaxConcurrency(config: FileTransferConfigItem) {
        const scopeKey = getConfigScopeKey(config);
        const queue = FileTransfer.queues[scopeKey];
        if (!queue || queue.length() < this.uploadTaskNumber || queue.concurrency >= this.maxConnections) {
            return
        }

        const inFlightProbe = FileTransfer.concurrencyProbeInFlight[scopeKey];
        if (inFlightProbe) {
			return inFlightProbe;
        }

        const now = Date.now();
        const lastStartedAt = FileTransfer.concurrencyProbeLastStartedAt[scopeKey] || 0;
        const elapsed = now - lastStartedAt;
        if (elapsed < FileTransfer.concurrencyProbeCooldownMs) {
			return
        }

        FileTransfer.concurrencyProbeLastStartedAt[scopeKey] = now;
        const probe = this.mutex.runExclusive(async () => {
            if (queue.length() < this.uploadTaskNumber || queue.concurrency >= this.maxConnections) {
                return
            }

            let testSuccess = true;
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 1000;

            while (retryCount < maxRetries && testSuccess) {
                try {
                    const pool = (config.type === "ftp")
                        ? FileTransfer.ftpConnectionPools[scopeKey]
                        : FileTransfer.sftpConnectionPools[scopeKey];

                    if (pool.length >= this.maxConnections + queue.running()) {
						break;
                    }

                    const connections = [];
                    for (let i = 0; i < this.maxConnections - queue.running() - pool.length; i++) {
                        connections.push(this.getClient(config));
                    }

                    let arr = await Promise.all(connections);
                    await Promise.all(arr.map(client => this.releaseClient(client, config)));

                    if (queue.concurrency < this.maxConnections) {
						queue.concurrency++;
                        FileTransfer.maxConnectionsMap[scopeKey] = queue.concurrency;
                        break;
                    } else {
						testSuccess = false; // 强制退出
                    }

                } catch (e) {
					oConsole.error(l10n.t('Failed to connect: {0}', `${e}`));
                    testSuccess = false; // 遇到错误，退出循环
                }

                retryCount++;

                if (retryCount < maxRetries && testSuccess) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }

		});

        FileTransfer.concurrencyProbeInFlight[scopeKey] = probe;
        try {
            await probe;
        } finally {
            delete FileTransfer.concurrencyProbeInFlight[scopeKey];
        }
    }

    async checkExistFolder(config: FileTransferConfigItem, client: FileTransferClient, file: string) {
        file = path.posix.join("/", file)
        file = getNormalPath(file)
        const scopeKey = getConfigScopeKey(config);
        const existingDirs = this.existCreateDir[scopeKey] || (this.existCreateDir[scopeKey] = new Set());
        if (existingDirs.has(file)) {
            return
        }

        const pendingDirs = this.existCreateDirPending[scopeKey] || (this.existCreateDirPending[scopeKey] = new Map());
        const pending = pendingDirs.get(file);
        if (pending) {
            return pending;
        }

        const ensureFolder = (async () => {
            if (config.type === "ftp") {
                const ftpClient = client as FTPClientType;
                let exist = await this.existFTPFile(ftpClient, file)
                if (!exist) {
                    await ftpClient.ensureDir(file)
                }
                existingDirs.add(file);
            } else {
                const sftpClient = client as SFTPClientType;
                const exists = await sftpClient.exists(file);
                if (!exists) {
                    await sftpClient.mkdir(file, true)
                }
                existingDirs.add(file);
            }
        })();

        pendingDirs.set(file, ensureFolder);
        try {
            await ensureFolder;
        } finally {
            pendingDirs.delete(file);
        }
    }

    /**
     * 关闭所有 FTP 或 SFTP 连接
     * @param name 指定要关闭的连接池名称，默认为空字符串，表示关闭所有连接池
     */
    static async closeAll(config?: FileTransferConfigItem) {
        const targetScope = config ? getConfigScopeKey(config) : '';
        if (config) {
            await FileTransfer.changeAsyncStatus(config, 'stop', 'stopped');
        } else {
            for (const queueConfig of Object.values(FileTransfer.queueConfigs)) {
                await FileTransfer.changeAsyncStatus(queueConfig, 'stop', 'stopped');
            }
        }

        const closeConnections = async <T extends FileTransferClient>(
            pools: Record<string, T[]>,
            closeClient: (client: T) => void | Promise<void>
        ) => {
            const tasks = [];
            for (const [scopeKey, clients] of Object.entries(pools)) {
                if (targetScope && scopeKey !== targetScope) continue;
                tasks.push(...clients.map(async (client) => {
                    await closeClient(client);
                }));
                pools[scopeKey] = [];
            }
            await Promise.all(tasks);
        };

        await closeConnections(FileTransfer.ftpConnectionPools, client => client.close());
        await closeConnections(FileTransfer.sftpConnectionPools, client => client.end());
        if (targetScope) {
            delete FileTransfer.queueConfigs[targetScope];
            FileTransfer.connectionLimiters.delete(targetScope);
        } else {
            FileTransfer.queueConfigs = {};
            FileTransfer.connectionLimiters.clear();
            FileTransfer.clientLeaseReleases = new WeakMap();
        }
    }


    static async changeAsyncStatus(
        config: FileTransferConfigItem,
        type: string,
        terminalState: TaskTerminalState = 'stopped'
    ) {
        const scopeKey = getConfigScopeKey(config);
        const queue = FileTransfer.queues[scopeKey];
        if (!queue) return
        switch (type) {
            case 'pause':
                queue.pause();
                break;
            case 'restart':
                queue.resume();
                break;
            case 'stop':
                FileTransfer.queueTerminalStates[scopeKey] = terminalState;
                queue.kill();
                await FileTransfer.queueOwners[scopeKey]?.finalizeQueue(FileTransfer.queueConfigs[scopeKey] || config, terminalState);
                delete FileTransfer.queues[scopeKey];
                delete FileTransfer.queueOwners[scopeKey];
                break;
            default:
                break;
        }
    }

    //清空缓存
    clearCache = async (config: FileTransferConfigItem) => {
		// 获取 workspaceState 对象
        const workspaceState = this.context.workspaceState
        const rootPath = config.workspaceRoot || this.rootPath
        const cache_key = `${config.name}###${rootPath}`
        await clearWatchCache(workspaceState, cache_key)
        myEvent.fire("update")
    }

    static async addTask(task: Task, lock: boolean = false) {
        await FileTransfer.addTasks([task], lock)
    }

    static async addTasks(tasks: Task[], lock: boolean = false) {
        const groupedTasks = new Map<string, Task[]>()
        for (const task of tasks) {
            const scopeKey = getConfigScopeKey(task.config)
            const scopedTasks = groupedTasks.get(scopeKey) || []
            scopedTasks.push(task)
            groupedTasks.set(scopeKey, scopedTasks)
        }

        for (const [scopeKey, scopedTasks] of groupedTasks) {
            if (!scopedTasks.length) continue
            const config = scopedTasks[0].config
            if (!FileTransfer.queues[scopeKey]) {
                new FileTransfer(config)
            }
            const instance = FileTransfer.queueOwners[scopeKey] || FileTransfer.instance
            const queue = FileTransfer.queues[scopeKey]
			if (!queue) throw new Error(`[queue:init][error] ${scopeKey}`)
            FileTransfer.finalizedQueues.delete(scopeKey)
            FileTransfer.queueTerminalStates[scopeKey] = undefined
            for (const task of scopedTasks) {
                task.remotePath = getNormalPath(task.remotePath)
            }

            myEvent.fire({
                name: config.name,
                workspaceRoot: config.workspaceRoot,
                status: 'start_sync',
                type: 'refreshSyncStatus',
            })

            try {
                if (lock) {
                // 如果需要锁，获取锁并执行任务
                const release = await instance.mutex.acquire();
                try {
                    queue.push(scopedTasks);
                } finally {
                    release();  // 确保任务执行完成后释放锁
                }
                } else {
                // 不需要锁的任务直接执行
                    queue.push(scopedTasks);
                }
            } catch (error) {
            // 捕获并处理异常
				oConsole.error(`[queue:add][error] ${error?.toString()}`);
            }
        }
    }
}
