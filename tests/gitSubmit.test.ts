import assert from 'assert';
import { installVscodeMock } from './setup/vscodeMock';
import type { GitCommandResult, GitCommandRunner } from '../src/utils';

installVscodeMock();

describe('git submit command safety', () => {
	let utils: typeof import('../src/utils');

	before(() => {
		utils = require('../src/utils');
	});

	function createRunner(results: Record<string, Partial<GitCommandResult>> = {}) {
		const calls: { args: readonly string[]; cwd: string }[] = [];
		const runner: GitCommandRunner = async (args, cwd) => {
			calls.push({ args, cwd });
			const key = args.join('\0');
			return {
				stdout: '',
				stderr: '',
				code: 0,
				...results[key]
			};
		};
		return { calls, runner };
	}

	it('passes the commit message as one argument instead of shell text', async () => {
		const message = `release "quoted"; git push evil`;
		const { calls, runner } = createRunner({
			[['diff', '--cached', '--quiet'].join('\0')]: { code: 1 }
		});

		const result = await utils.runSubmitGit('C:\\repo with spaces', message, runner);

		assert.deepStrictEqual(result, { committed: true, noChanges: false, pushed: true });
		assert.deepStrictEqual(calls.map(call => call.args), [
			['add', '.'],
			['diff', '--cached', '--quiet'],
			['commit', '-m', message],
			['push']
		]);
		assert.equal(calls.every(call => call.cwd === 'C:\\repo with spaces'), true);
	});

	it('skips commit when there are no staged changes but still pushes', async () => {
		const { calls, runner } = createRunner();

		const result = await utils.runSubmitGit('/workspace/repo', 'sync', runner);

		assert.deepStrictEqual(result, { committed: false, noChanges: true, pushed: true });
		assert.deepStrictEqual(calls.map(call => call.args), [
			['add', '.'],
			['diff', '--cached', '--quiet'],
			['push']
		]);
	});

	it('labels authentication failures from git push', async () => {
		const { runner } = createRunner({
			[['diff', '--cached', '--quiet'].join('\0')]: { code: 1 },
			push: { code: 128, stderr: 'Permission denied (publickey).' }
		});

		await assert.rejects(
			() => utils.runSubmitGit('/workspace/repo', 'sync', runner),
			/\[push:authentication\]/
		);
	});

	it('rejects a blank commit message before running git', async () => {
		const { calls, runner } = createRunner();

		await assert.rejects(
			() => utils.runSubmitGit('/workspace/repo', '   ', runner),
			/No git commit information was entered/
		);
		assert.deepStrictEqual(calls, []);
	});
});
