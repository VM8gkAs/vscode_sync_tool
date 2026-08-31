import fs from 'fs-extra';
import type { FileTransferConfigItem } from './types/config';

export type SftpRuntimeConnectionConfig = FileTransferConfigItem & {
    privateKey?: Buffer | string;
};

export function applySftpPrivateKey(config: SftpRuntimeConnectionConfig): void {
    const keyPath = typeof config.privateKeyPath === 'string'
        ? config.privateKeyPath.trim()
        : '';

    config.privateKeyPath = undefined;
    config.privateKey = undefined;
    if (!keyPath) return;

    let isFile = false;
    try {
        isFile = fs.statSync(keyPath).isFile();
    } catch {
        return;
    }
    if (!isFile) return;

    config.privateKey = fs.readFileSync(keyPath);
    config.password = undefined;
}
