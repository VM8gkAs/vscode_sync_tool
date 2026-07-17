import type { opType } from './types/config';

const WATCH_CACHE_BATCH_DELAY_MS = 50;
const pendingWatchCacheUpdates = new Map<string, Promise<void>>();

export type WatchRenameIndex = Map<string, Set<string>>;

export type WatchCacheStorage = {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): PromiseLike<void>;
};

type PendingWatchOperation = {
	file: string;
	opTypeValue: opType;
};

type PendingWatchBatch = {
	storage: WatchCacheStorage;
	operations: PendingWatchOperation[];
	timer: NodeJS.Timeout;
	waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
};

const pendingWatchBatches = new Map<string, PendingWatchBatch>();

export async function runSerializedWatchCacheUpdate(
	key: string,
	update: () => Promise<void>
): Promise<void> {
	const previous = pendingWatchCacheUpdates.get(key) ?? Promise.resolve();
	const current = previous
		.catch(() => undefined)
		.then(update);

	pendingWatchCacheUpdates.set(key, current);
	try {
		await current;
	} finally {
		if (pendingWatchCacheUpdates.get(key) === current) {
			pendingWatchCacheUpdates.delete(key);
		}
	}
}

export function buildWatchRenameIndex(data: Record<string, opType>): WatchRenameIndex {
	const index: WatchRenameIndex = new Map();
	for (const [key, operation] of Object.entries(data)) {
		if (operation.op !== 'rename') continue;
		const sources = index.get(operation.newname) || new Set<string>();
		sources.add(key);
		index.set(operation.newname, sources);
	}
	return index;
}

function removeIndexedEntry(data: Record<string, opType>, index: WatchRenameIndex, key: string) {
	const previous = data[key];
	if (previous?.op === 'rename') {
		const sources = index.get(previous.newname);
		sources?.delete(key);
		if (!sources?.size) index.delete(previous.newname);
	}
	delete data[key];
}

function setIndexedEntry(
	data: Record<string, opType>,
	index: WatchRenameIndex,
	key: string,
	operation: opType
) {
	removeIndexedEntry(data, index, key);
	data[key] = { ...operation };
	if (operation.op === 'rename') {
		const sources = index.get(operation.newname) || new Set<string>();
		sources.add(key);
		index.set(operation.newname, sources);
	}
}

export function mergeWatchCacheEntry(
	currentData: Record<string, opType>,
	file: string,
	opTypeValue: opType,
	renameIndex: WatchRenameIndex = buildWatchRenameIndex(currentData)
): Record<string, opType> {
	const data = currentData;
	const newOpType = { ...opTypeValue };
	const currentOpType = data[file];

	if (currentOpType && currentOpType.type === newOpType.type) {
		if (currentOpType.op === 'add' && newOpType.op === 'delete') {
			removeIndexedEntry(data, renameIndex, file);
		} else if (currentOpType.op === 'delete' && newOpType.op === 'add') {
			removeIndexedEntry(data, renameIndex, file);
		} else if (currentOpType.op === 'add' && newOpType.op === 'rename') {
			setIndexedEntry(data, renameIndex, newOpType.newname, {
				op: 'add',
				type: newOpType.type,
				...(newOpType.md5 === undefined ? {} : { md5: newOpType.md5 })
			});
			removeIndexedEntry(data, renameIndex, file);
		} else if (currentOpType.op === 'edit' && newOpType.op === 'rename') {
			setIndexedEntry(data, renameIndex, newOpType.newname, {
				op: 'add',
				type: newOpType.type,
				...(newOpType.md5 === undefined ? {} : { md5: newOpType.md5 })
			});
			setIndexedEntry(data, renameIndex, file, {
				op: 'delete',
				type: currentOpType.type,
				...(currentOpType.md5 === undefined ? {} : { md5: currentOpType.md5 })
			});
		} else {
			setIndexedEntry(data, renameIndex, file, newOpType);
		}
	} else {
		const sources = newOpType.op === 'rename' || newOpType.op === 'delete'
			? Array.from(renameIndex.get(file) || [])
			: [];
		if (sources.length) {
			for (const source of sources) {
				setIndexedEntry(data, renameIndex, source, newOpType);
			}
		} else {
			setIndexedEntry(data, renameIndex, file, newOpType);
		}
	}

	return data;
}

export function queueWatchCacheUpdate(
	storage: WatchCacheStorage,
	key: string,
	file: string,
	opTypeValue: opType
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const pending = pendingWatchBatches.get(key);
		if (pending) {
			pending.operations.push({ file, opTypeValue: { ...opTypeValue } });
			pending.waiters.push({ resolve, reject });
			return;
		}

		const batch: PendingWatchBatch = {
			storage,
			operations: [{ file, opTypeValue: { ...opTypeValue } }],
			waiters: [{ resolve, reject }],
			timer: setTimeout(() => {
				void flushWatchCacheUpdates(key).catch(() => undefined);
			}, WATCH_CACHE_BATCH_DELAY_MS)
		};
		pendingWatchBatches.set(key, batch);
	});
}

export async function flushWatchCacheUpdates(key: string): Promise<void> {
	const pending = pendingWatchBatches.get(key);
	if (!pending) {
		await pendingWatchCacheUpdates.get(key);
		return;
	}

	clearTimeout(pending.timer);
	pendingWatchBatches.delete(key);
	try {
		await runSerializedWatchCacheUpdate(key, async () => {
			const current = pending.storage.get<Record<string, opType>>(key);
			const data = typeof current === 'object' && current !== null ? current : {};
			const renameIndex = buildWatchRenameIndex(data);
			for (const operation of pending.operations) {
				mergeWatchCacheEntry(data, operation.file, operation.opTypeValue, renameIndex);
			}
			await pending.storage.update(key, data);
		});
		pending.waiters.forEach(waiter => waiter.resolve());
	} catch (error) {
		pending.waiters.forEach(waiter => waiter.reject(error));
		throw error;
	}
}

export async function flushAllWatchCacheUpdates(): Promise<void> {
	const keys = new Set([...pendingWatchBatches.keys(), ...pendingWatchCacheUpdates.keys()]);
	await Promise.all(Array.from(keys, key => flushWatchCacheUpdates(key)));
}

export async function clearWatchCache(storage: WatchCacheStorage, key: string): Promise<void> {
	await flushWatchCacheUpdates(key);
	await runSerializedWatchCacheUpdate(key, async () => {
		await storage.update(key, '');
	});
}
