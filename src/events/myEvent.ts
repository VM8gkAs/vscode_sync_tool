import * as vscode from 'vscode';
import type { Task, TaskTerminalState } from '../types/config';

export type SyncStatus = 'start_sync' | 'complete_sync';

export type MyEvent =
	| 'update'
	| 'updateMenu'
	| {
		type: 'refreshNode';
		nodePath: string;
		task: Task;
	}
	| {
		type: 'refreshSyncStatus';
		name: string;
		workspaceRoot?: string;
		status: 'start_sync';
	}
	| {
		type: 'refreshSyncStatus';
		name: string;
		workspaceRoot?: string;
		status: 'complete_sync';
		terminalState: TaskTerminalState;
	};

// 定义自定义事件
export const myEvent = new vscode.EventEmitter<MyEvent>();

