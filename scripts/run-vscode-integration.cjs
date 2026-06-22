const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
	const version = process.argv[2] || '1.82.0';
	const extensionDevelopmentPath = path.resolve(__dirname, '..');
	const extensionTestsPath = path.resolve(__dirname, 'vscode-integration-suite.cjs');

	// VS Code integrated terminals may set this for helper processes. Electron
	// must start normally when launching an Extension Host integration test.
	delete process.env.ELECTRON_RUN_AS_NODE;

	await runTests({
		version,
		extensionDevelopmentPath,
		extensionTestsPath,
		extensionTestsEnv: {
			EXPECTED_VSCODE_VERSION: version
		},
		launchArgs: [
			'--disable-extensions',
			'--disable-workspace-trust',
			'--skip-welcome'
		]
	});
}

main().catch(error => {
	console.error('VS Code integration test failed:', error);
	process.exit(1);
});
