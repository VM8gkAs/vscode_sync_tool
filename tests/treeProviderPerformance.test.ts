import assert from 'assert';
import {
	installVscodeMock,
	resetVscodeMock,
	vscodeMockExtensionContext
} from './setup/vscodeMock';

installVscodeMock();

describe('Tree provider batching and cache eviction', () => {
	let tree: typeof import('../src/treeProvider');

	before(() => {
		require('../src/config/globals').setContext(vscodeMockExtensionContext);
		tree = require('../src/treeProvider');
	});

	beforeEach(() => {
		resetVscodeMock();
	});

	function createConfig() {
		return {
			name: 'main',
			type: 'sftp',
			host: 'example.com',
			port: 22,
			username: 'user',
			password: 'pw',
			remotePath: '/remote',
			workspaceRoot: 'C:\\workspace'
		} as any;
	}

	it('coalesces upload completions into one sorted tree refresh', async () => {
		const provider = new tree.DepNodeProvider();
		const config = createConfig();
		const root = new tree.Dependency(config, 2, '', '', 0);
		root.isRun = true;
		provider.addNodes(root);
		let refreshEvents = 0;
		provider.onDidChangeTreeData(() => {
			refreshEvents++;
		});

		provider.queueUploadComplete({
			config,
			localPath: 'C:\\workspace\\z.txt',
			remotePath: '/remote/z.txt',
			operationType: 'upload',
			fileSize: 1
		});
		provider.queueUploadComplete({
			config,
			localPath: 'C:\\workspace\\a.txt',
			remotePath: '/remote/a.txt',
			operationType: 'upload',
			fileSize: 1
		});
		await provider.flushUploadComplete('C:\\workspace###main');

		assert.deepStrictEqual(root.children.map(child => child.file.name), ['a.txt', 'z.txt']);
		assert.strictEqual(refreshEvents, 1);
	});

	it('evicts only the refreshed subtree from the node index', async () => {
		const provider = new tree.DepNodeProvider();
		const config = createConfig();
		const root = new tree.Dependency(config, 2, '', '', 0);
		const folder = new tree.RepositoryFileNode(
			{ name: 'folder', isDirectory: true, size: 0 },
			root,
			'/remote'
		);
		const file = new tree.RepositoryFileNode(
			{ name: 'file.txt', isDirectory: false, size: 1 },
			folder,
			'/remote/folder'
		);
		root.children = [folder];
		folder.children = [file];
		provider.addNodes(root, folder, file);

		await provider.refreshEntry(folder, 'refresh');
		const nodes = provider.getAllNodes();

		assert.strictEqual(nodes.has('C:\\workspace###main###/remote'), true);
		assert.strictEqual(nodes.has('C:\\workspace###main###/remote/folder'), true);
		assert.strictEqual(nodes.has('C:\\workspace###main###/remote/folder/file.txt'), false);
		assert.deepStrictEqual(folder.children, []);
	});
});
