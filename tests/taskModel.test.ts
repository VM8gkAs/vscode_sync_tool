import { strict as assert } from 'assert';
import { cloneTask } from '../src/task';
import { FileTransferConfigItem, TargetTypes, Task } from '../src/types/config';

const config: FileTransferConfigItem = {
	name: 'main',
	type: TargetTypes.sftp,
	host: 'example.com',
	port: 22,
	username: 'user',
	remotePath: '/remote'
};

describe('task model', () => {
	it('clones task state without serializing the shared config', () => {
		const task: Task = {
			config,
			localPath: '/local/source.txt',
			remotePath: '/remote/source.txt',
			operationType: 'rename',
			fileChunks: [{ start: 0, end: 10 }]
		};

		const cloned = cloneTask(task, {
			localPath: '/local/target.txt',
			remotePath: '/remote/target.txt',
			operationType: 'upload'
		});

		assert.notStrictEqual(cloned, task);
		assert.strictEqual(cloned.config, task.config);
		assert.notStrictEqual(cloned.fileChunks, task.fileChunks);
		assert.notStrictEqual(cloned.fileChunks?.[0], task.fileChunks?.[0]);
		assert.equal(cloned.operationType, 'upload');
		assert.equal(task.operationType, 'rename');
	});
});
