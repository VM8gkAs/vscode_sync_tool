const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vscode = require('vscode');
const { parse } = require('jsonc-parser');

function parseVersion(version) {
	return version.split('.').map(value => Number.parseInt(value, 10));
}

function isAtLeast(actual, minimum) {
	const actualParts = parseVersion(actual);
	const minimumParts = parseVersion(minimum);

	for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
		const actualPart = actualParts[index] ?? 0;
		const minimumPart = minimumParts[index] ?? 0;
		if (actualPart !== minimumPart) {
			return actualPart > minimumPart;
		}
	}

	return true;
}

async function assertSyncConfigSchemaDocumentation() {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-sync-schema-'));
	const filePath = path.join(directory, 'sync_config.jsonc');
	const uri = vscode.Uri.file(filePath);

	try {
		await fs.writeFile(filePath, '{\n  "test": {\n    \n  }\n}\n');
		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document, { preview: false });
		await new Promise(resolve => setTimeout(resolve, 250));

		const completions = await vscode.commands.executeCommand(
			'vscode.executeCompletionItemProvider',
			uri,
			new vscode.Position(2, 4)
		);
		const typeCompletions = completions.items.filter(item => (typeof item.label === 'string' ? item.label : item.label.label) === 'type');
		assert.strictEqual(typeCompletions.length, 1, 'sync_config.jsonc completion must include type exactly once');
		const [typeCompletion] = typeCompletions;
		assert.ok(typeCompletion, 'sync_config.jsonc completion did not include type');
		const documentation = typeof typeCompletion.documentation === 'string'
			? typeCompletion.documentation
			: typeCompletion.documentation?.value ?? '';
		assert.ok(documentation.trim(), 'sync_config.jsonc completion did not provide flag documentation');

		const completionText = typeCompletion.textEdit?.newText ?? typeCompletion.insertText;
		assert.ok(completionText, 'sync_config.jsonc completion must provide insertText or textEdit');
		const snippet = typeof completionText === 'string' ? completionText : completionText.value;
		const insertedText = snippet.replace(/\$\{\d+(?::([^}]*))?\}|\$\d+/g, (_match, defaultValue) => defaultValue ?? '');
		const completionRange = typeCompletion.textEdit?.range;
		const completionStart = document.offsetAt(completionRange?.start ?? new vscode.Position(2, 4));
		const completionEnd = document.offsetAt(completionRange?.end ?? completionRange?.start ?? new vscode.Position(2, 4));
		const completedConfig = `${document.getText().slice(0, completionStart)}${insertedText}${document.getText().slice(completionEnd)}`;
		const parseErrors = [];
		const parsedConfig = parse(completedConfig, parseErrors, { allowTrailingComma: true });
		assert.deepStrictEqual(parseErrors, [], `completion must form valid JSONC: ${JSON.stringify(parseErrors)}`);
		assert.strictEqual(parsedConfig.test.type, '', 'completion must insert a valid type property');

		const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
		const edit = new vscode.WorkspaceEdit();
		edit.replace(uri, fullRange, completedConfig);
		await vscode.workspace.applyEdit(edit);
		const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, new vscode.Position(2, 6));
		assert.ok(hovers.length > 0, 'sync_config.jsonc hover did not provide flag documentation');
		const hoverDocumentation = hovers.flatMap(hover => hover.contents).map(content => typeof content === 'string' ? content : content.value ?? '').join('');
		assert.ok(hoverDocumentation.trim(), 'sync_config.jsonc hover documentation was empty');

	} finally {
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
}

async function run() {
	const expectedVersion = process.env.EXPECTED_VSCODE_VERSION || '1.101.0';
	if (expectedVersion === 'stable') {
		assert.ok(
			isAtLeast(vscode.version, '1.101.0'),
			`Expected current Stable VS Code to be at least 1.101.0, received ${vscode.version}`
		);
	} else {
		assert.equal(vscode.version, expectedVersion);
	}

	const extension = vscode.extensions.getExtension('oorzc.ssh-tools');
	assert.ok(extension, 'Extension oorzc.ssh-tools was not discovered');
	assert.equal(extension.packageJSON.engines.vscode, '^1.101.0');

	await extension.activate();
	assert.equal(extension.isActive, true, 'Extension did not activate');
	await assertSyncConfigSchemaDocumentation();
}

module.exports = { run };
