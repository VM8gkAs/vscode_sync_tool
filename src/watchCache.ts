import { opType } from './types/config';

const pendingWatchCacheUpdates = new Map<string, Promise<void>>();

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

export function mergeWatchCacheEntry(
	currentData: Record<string, opType>,
	file: string,
	opTypeValue: opType
): Record<string, opType> {
	const data = currentData;
	const newOpType = { ...opTypeValue };

	if (data[file] && data[file].type === newOpType.type) {
		if (data[file].op === 'add' && newOpType.op === 'delete') {
			delete data[file];
		} else if (data[file] && data[file].op === 'delete' && newOpType.op === 'add') {
			delete data[file];
		} else if (data[file] && data[file].op === 'add' && newOpType.op === 'rename' && newOpType.newname) {
			newOpType.op = 'add';
			data[newOpType.newname] = newOpType;
			delete data[file];
		} else if (data[file] && data[file].op === 'edit' && newOpType.op === 'rename' && newOpType.newname) {
			newOpType.op = 'add';
			data[newOpType.newname] = newOpType;
			data[file].op = 'delete';
		} else {
			data[file] = newOpType;
		}
	} else {
		let flag = false;
		for (const [k, v] of Object.entries(data)) {
			if ((newOpType.op === 'rename' || newOpType.op === 'delete') && v.newname && v.newname === file) {
				flag = true;
				data[k] = newOpType;
			}
		}
		if (!flag) {
			data[file] = newOpType;
		}
	}

	return data;
}
