import assert from 'assert';
import {
	buildWatchRenameIndex,
	clearWatchCache,
	flushWatchCacheUpdates,
	mergeWatchCacheEntry,
	queueWatchCacheUpdate,
	runSerializedWatchCacheUpdate
} from '../src/watchCache';
import { opType } from '../src/types/config';

describe('mergeWatchCacheEntry', () => {
	it('stores a copy so later caller mutations do not alter the cache', () => {
		const operation: opType = { op: 'add', type: 'file' };
		const data = mergeWatchCacheEntry({}, '/project/file.txt', operation);

		assert.notStrictEqual(data['/project/file.txt'], operation);
		operation.type = 'directory';
		assert.equal(data['/project/file.txt'].type, 'file');
	});

	it('removes a pending add when the same file is deleted', () => {
		const data = mergeWatchCacheEntry(
			{
				'/workspace/a.txt': { op: 'add', type: 'file' }
			},
			'/workspace/a.txt',
			{ op: 'delete', type: 'file' }
		);

		assert.deepStrictEqual(data, {});
	});

	it('turns add + rename into a pending add for the new path', () => {
		const data = mergeWatchCacheEntry(
			{
				'/workspace/a.txt': { op: 'add', type: 'file' }
			},
			'/workspace/a.txt',
			{ op: 'rename', type: 'file', newname: '/workspace/b.txt' }
		);

		assert.deepStrictEqual(data, {
			'/workspace/b.txt': { op: 'add', type: 'file' }
		});
	});

	it('keeps an edited old path as delete and adds the renamed path', () => {
		const data = mergeWatchCacheEntry(
			{
				'/workspace/a.txt': { op: 'edit', type: 'file' }
			},
			'/workspace/a.txt',
			{ op: 'rename', type: 'file', newname: '/workspace/b.txt' }
		);

		assert.deepStrictEqual(data, {
			'/workspace/a.txt': { op: 'delete', type: 'file' },
			'/workspace/b.txt': { op: 'add', type: 'file' }
		});
	});

	it('updates an existing rename chain by matching newname', () => {
		const data: Record<string, opType> = {
			'/workspace/a.txt': { op: 'rename', type: 'file', newname: '/workspace/b.txt' }
		};

		const result = mergeWatchCacheEntry(
			data,
			'/workspace/b.txt',
			{ op: 'rename', type: 'file', newname: '/workspace/c.txt' }
		);

		assert.deepStrictEqual(result, {
			'/workspace/a.txt': { op: 'rename', type: 'file', newname: '/workspace/c.txt' }
		});
	});

	it('serializes updates for the same cache key', async () => {
		const events: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>(resolve => {
			releaseFirst = resolve;
		});

		const first = runSerializedWatchCacheUpdate('main###workspace', async () => {
			events.push('first:start');
			await firstGate;
			events.push('first:end');
		});
		const second = runSerializedWatchCacheUpdate('main###workspace', async () => {
			events.push('second:start');
			events.push('second:end');
		});

		await new Promise(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual(events, ['first:start']);

		releaseFirst?.();
		await Promise.all([first, second]);
		assert.deepStrictEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
	});

	it('allows independent cache keys to update concurrently', async () => {
		const events: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstGate = new Promise<void>(resolve => {
			releaseFirst = resolve;
		});

		const first = runSerializedWatchCacheUpdate('main###workspace', async () => {
			events.push('first:start');
			await firstGate;
		});
		const second = runSerializedWatchCacheUpdate('backup###workspace', async () => {
			events.push('second:start');
		});

		await second;
		assert.deepStrictEqual(events, ['first:start', 'second:start']);
		releaseFirst?.();
		await first;
	});

	it('batches ordered file events into one workspace-state write', async () => {
		const key = 'main###batched-workspace';
		let value: unknown = {};
		let updateCalls = 0;
		const storage = {
			get: <T>(_key: string) => value as T,
			update: async (_key: string, nextValue: unknown) => {
				updateCalls++;
				value = nextValue;
			}
		};

		const add = queueWatchCacheUpdate(storage, key, '/workspace/a.txt', { op: 'add', type: 'file' });
		const rename = queueWatchCacheUpdate(storage, key, '/workspace/a.txt', {
			op: 'rename',
			type: 'file',
			newname: '/workspace/b.txt'
		});
		await flushWatchCacheUpdates(key);
		await Promise.all([add, rename]);

		assert.strictEqual(updateCalls, 1);
		assert.deepStrictEqual(value, {
			'/workspace/b.txt': { op: 'add', type: 'file' }
		});
	});

	it('flushes queued events before clearing the watch cache', async () => {
		const key = 'main###clear-workspace';
		let value: unknown = {};
		const writes: unknown[] = [];
		const storage = {
			get: <T>(_key: string) => value as T,
			update: async (_key: string, nextValue: unknown) => {
				writes.push(nextValue);
				value = nextValue;
			}
		};

		const queued = queueWatchCacheUpdate(storage, key, '/workspace/a.txt', { op: 'add', type: 'file' });
		await clearWatchCache(storage, key);
		await queued;

		assert.strictEqual(writes.length, 2);
		assert.strictEqual(value, '');
	});

	it('updates duplicate rename targets through the index without scanning all entries', () => {
		const data: Record<string, opType> = {
			'/workspace/a.txt': { op: 'rename', type: 'file', newname: '/workspace/target.txt' },
			'/workspace/b.txt': { op: 'rename', type: 'file', newname: '/workspace/target.txt' }
		};
		const index = buildWatchRenameIndex(data);

		mergeWatchCacheEntry(
			data,
			'/workspace/target.txt',
			{ op: 'delete', type: 'file' },
			index
		);

		assert.deepStrictEqual(data, {
			'/workspace/a.txt': { op: 'delete', type: 'file' },
			'/workspace/b.txt': { op: 'delete', type: 'file' }
		});
	});
});
