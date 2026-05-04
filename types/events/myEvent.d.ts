import * as vscode from 'vscode';
import type { Task } from '../types/config';
export type SyncEvent = 'update' | 'updateMenu' | {
    type: 'refreshNode';
    nodePath: string;
    task: Task;
} | {
    type: 'refreshSyncStatus';
    name: string;
    status: string;
};
export declare const myEvent: vscode.EventEmitter<SyncEvent>;
//# sourceMappingURL=myEvent.d.ts.map