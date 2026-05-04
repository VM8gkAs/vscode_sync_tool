import * as vscode from 'vscode';
import type { Task } from '../types/config';

export type SyncEvent =
	| 'update'
	| 'updateMenu'
	| { type: 'refreshNode'; nodePath: string; task: Task }
	| { type: 'refreshSyncStatus'; name: string; status: string };

export const myEvent = new vscode.EventEmitter<SyncEvent>();
