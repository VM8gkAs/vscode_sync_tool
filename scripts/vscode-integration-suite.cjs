const assert = require('node:assert/strict');
const vscode = require('vscode');

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

async function run() {
	const expectedVersion = process.env.EXPECTED_VSCODE_VERSION || '1.82.0';
	if (expectedVersion === 'stable') {
		assert.ok(
			isAtLeast(vscode.version, '1.82.0'),
			`Expected current Stable VS Code to be at least 1.82.0, received ${vscode.version}`
		);
	} else {
		assert.equal(vscode.version, expectedVersion);
	}

	const extension = vscode.extensions.getExtension('oorzc.ssh-tools');
	assert.ok(extension, 'Extension oorzc.ssh-tools was not discovered');
	assert.equal(extension.packageJSON.engines.vscode, '^1.82.0');

	await extension.activate();
	assert.equal(extension.isActive, true, 'Extension did not activate');
}

module.exports = { run };
