import assert from 'assert';
import { mergeWatchCacheEntry, runSerializedWatchCacheUpdate } from '../src/watchCache';
import { opType } from '../src/types/config';

describe('mergeWatchCacheEntry', () => {
	it('stores a copy so later caller mutations do not alter the cache', () => {
		const operation = { op: 'add', type: 'file' };
		const data = mergeWatchCacheEntry({}, '/project/file.txt', operation);

		assert.notStrictEqual(data['/project/file.txt'], operation);
		operation.op = 'delete';
		assert.equal(data['/project/file.txt'].op, 'add');
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
			'/workspace/b.txt': { op: 'add', type: 'file', newname: '/workspace/b.txt' }
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
			'/workspace/b.txt': { op: 'add', type: 'file', newname: '/workspace/b.txt' }
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
});
