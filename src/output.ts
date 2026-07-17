import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';
import { StatusBarUi } from './statusBar';
import { FileTransferConfigItem, Task } from './types/config';
import {
    debounce,
    DEFAULT_SYNC_LOG_DIRECTORY,
    getPluginSetting,
    oConsole,
    resolveSyncLogDirectory
} from './utils';

export const outputChannel = vscode.window.createOutputChannel('async-tools-output');
export const SYNC_LOG_FILE_NAME = 'sync-tools.log';

const pendingFileWrites = new Map<string, Promise<void>>();
const persistedTaskLines = new Map<string, { filePath: string; line: string }>();

export function getSyncLogFilePath(config: Pick<FileTransferConfigItem, 'workspaceRoot'>): string | null {
    if (!config.workspaceRoot) return null;

    const syncConfig = getPluginSetting(config.workspaceRoot);
    if (!syncConfig.get<boolean>('logToFile', false)) return null;

    const configuredDirectory = syncConfig.get<string>('logDirectory', DEFAULT_SYNC_LOG_DIRECTORY);
    const logDirectory = resolveSyncLogDirectory(config.workspaceRoot, configuredDirectory);
    return logDirectory ? path.join(logDirectory, SYNC_LOG_FILE_NAME) : null;
}

async function appendSyncLogLine(filePath: string, line: string): Promise<void> {
    const previousWrite = pendingFileWrites.get(filePath) || Promise.resolve();
    const currentWrite = previousWrite
        .catch(() => undefined)
        .then(async () => {
            await fs.ensureDir(path.dirname(filePath));
            await fs.appendFile(filePath, `${line}\n`, 'utf8');
        });
    pendingFileWrites.set(filePath, currentWrite);

    try {
        await currentWrite;
    } catch (error) {
        oConsole.error(`[sync-tools][log][error] ${filePath}: ${error}`);
    } finally {
        if (pendingFileWrites.get(filePath) === currentWrite) {
            pendingFileWrites.delete(filePath);
        }
    }
}

export async function writeSyncLogLine(
    config: Pick<FileTransferConfigItem, 'workspaceRoot'>,
    line: string
): Promise<void> {
    const filePath = getSyncLogFilePath(config);
    if (!filePath) return;
    await appendSyncLogLine(filePath, line);
}

const debounceShowLogPanel = debounce(() => {
    const syncConfig = getPluginSetting();
    const logShow = syncConfig.get<boolean>('logShow', true);
    if (logShow) {
        outputChannel.show(true);
    }
}, 1000, true);

let tasks: (string | Task)[] = [];
let lastUpdateTime = 0;
const updateInterval = 1000;
let timeout: NodeJS.Timeout | undefined;

function throttledUpdateProgress(forceUpdate: boolean = false) {
    debounceShowLogPanel();

    const now = Date.now();
    if (now - lastUpdateTime >= updateInterval || forceUpdate) {
        lastUpdateTime = now;
        updateProgress();

        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            updateProgress();
        }, 1100);
    }
}

function formatTaskLog(task: Task): string | null {
    if (task.progress === undefined) return null;

    const operationLabel = task.compare
        ? 'compare'
        : task.operationType === 'rename' && task.pathChangeType
            ? task.pathChangeType
            : task.operationType;
    let commonText = `[${task.start}][${task.config.name}][${task.config.type}][${operationLabel}]`;
    if (task.fileSizeText) {
        commonText += `[${task.fileSizeText}]`;
    }

    let destination = task.operationType === 'download'
        ? `${task.remotePath} -> ${task.localPath}`
        : `${task.localPath} -> ${task.remotePath}`;
    if (task.compare) {
        destination = task.remotePath;
    }

    if (task.error) {
        return `${commonText}[error]: ${destination}  ${task.error}`;
    }
    if (task.progress >= 100) {
        const useTime = task.useTime ? `[${task.useTime}]` : '';
        return `${commonText}${useTime}: ${destination}`;
    }

    const progressBlocks = Math.floor(task.progress / 10);
    const progressText = task.progress
        ? `[${'#'.repeat(progressBlocks)}${'-'.repeat(10 - progressBlocks)}] ${task.progress}%`
        : '';
    return `${commonText}${progressText}: ${destination}`;
}

function persistTaskLog(task: Task, line: string) {
    if (!task.id) return;

    const filePath = getSyncLogFilePath(task.config);
    if (!filePath) return;

    const previousLine = persistedTaskLines.get(task.id);
    if (previousLine?.filePath === filePath && previousLine.line === line) return;

    persistedTaskLines.set(task.id, { filePath, line });
    void appendSyncLogLine(filePath, line);
}

function trimTasksToConfiguredLimit() {
    const configuredLimit = getPluginSetting().get<number>('logNumberLimit', 500);
    const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.floor(configuredLimit)) : 500;
    if (tasks.length <= limit) return;

    const removedTasks = tasks.splice(0, tasks.length - limit);
    for (const removedTask of removedTasks) {
        if (typeof removedTask !== 'string' && removedTask.id) {
            persistedTaskLines.delete(removedTask.id);
        }
    }
}

export function updateProgress(showAll: boolean = false) {
    const recentTasks = showAll ? tasks.slice() : tasks.slice(-100);
    const outputLines: string[] = [];

    recentTasks.sort((a, b) => {
        if (typeof a === 'string' || typeof b === 'string') return 0;
        if (a.start && b.start && a.start !== b.start) {
            return new Date(a.start).getTime() - new Date(b.start).getTime();
        }
        if (a.progress === 100 && b.progress !== 100) return -1;
        if (a.progress !== 100 && b.progress === 100) return 1;
        if (a.error && !b.error) return -1;
        if (!a.error && b.error) return 1;
        return 0;
    });

    for (const task of recentTasks) {
        if (typeof task === 'string') {
            outputLines.push(task);
            continue;
        }

        const line = formatTaskLog(task);
        if (!line) continue;
        outputLines.push(line);
        persistTaskLog(task, line);
    }

    if (recentTasks.length) {
        StatusBarUi.working(recentTasks[recentTasks.length - 1]);
    }
    outputChannel.clear();
    outputChannel.appendLine(outputLines.join('\n'));
}

export function addLogTask(task: string | Task, config?: Pick<FileTransferConfigItem, 'workspaceRoot'>) {
    if (typeof task === 'string') {
        tasks.push(task);
        if (config) void writeSyncLogLine(config, task);
    } else if (!task.id) {
        task.id = uuidv4();
        tasks.push(task);
    } else if (!tasks.find(item => typeof item !== 'string' && item.id === task.id)) {
        tasks.push(task);
    }
    trimTasksToConfiguredLimit();
    throttledUpdateProgress();
}

export function cleanLogTask(isClear: boolean = false) {
    tasks = [];
    persistedTaskLines.clear();
    if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
    }
    lastUpdateTime = 0;
    if (isClear) outputChannel.clear();
}

export function updateTaskProgress(forceUpdate: boolean = false) {
    throttledUpdateProgress(forceUpdate);
}
