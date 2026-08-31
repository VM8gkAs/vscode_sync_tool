import assert from 'assert';
import { installVscodeMock } from './setup/vscodeMock';

installVscodeMock();

describe('remote virtual document boundary', () => {
	it('accepts only async-tools documents for remote save handling', () => {
		const { isRemoteVirtualDocumentUri } = require('../src/extension');
		assert.strictEqual(isRemoteVirtualDocumentUri({ scheme: 'async-tools' }), true);
		assert.strictEqual(isRemoteVirtualDocumentUri({ scheme: 'file' }), false);
		assert.strictEqual(isRemoteVirtualDocumentUri({ scheme: 'untitled' }), false);
	});
});

describe('watch change persistence boundary', () => {
	it('keeps a delete after the local path has disappeared', () => {
		const { isRecordableWatchChange } = require('../src/extension');
		const missingPath = 'C:\\workspace\\definitely-missing-sync-tools-path';

		assert.strictEqual(isRecordableWatchChange(missingPath, { op: 'delete', type: 'file' }), true);
		assert.strictEqual(isRecordableWatchChange(missingPath, { op: 'add', type: 'file' }), false);
	});
});
