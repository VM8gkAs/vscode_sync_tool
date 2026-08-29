import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
	const filePath = path.join(projectRoot, relativePath);
	return JSON.parse(await readFile(filePath, 'utf8'));
}

function compareKeys(base, translation) {
	const baseKeys = new Set(Object.keys(base));
	const translationKeys = new Set(Object.keys(translation));

	return {
		missing: [...baseKeys].filter(key => !translationKeys.has(key)).sort(),
		extra: [...translationKeys].filter(key => !baseKeys.has(key)).sort()
	};
}

async function collectFiles(directory, pattern) {
	const files = await readdir(path.join(projectRoot, directory));
	return files
		.filter(file => pattern.test(file))
		.sort()
		.map(file => path.join(directory, file));
}

async function collectFilesRecursive(directory, pattern) {
	const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
	const files = await Promise.all(entries.map(entry => {
		const relativePath = path.join(directory, entry.name);
		return entry.isDirectory()
			? collectFilesRecursive(relativePath, pattern)
			: Promise.resolve(pattern.test(entry.name) ? [relativePath] : []);
	}));
	return files.flat().sort();
}

async function findMissingRuntimeSourceKeys(baseFile) {
	const baseKeys = new Set(Object.keys(await readJson(baseFile)));
	const sourceFiles = await collectFilesRecursive('src', /\.ts$/);
	const missing = new Set();

	for (const file of sourceFiles) {
		const source = await readFile(path.join(projectRoot, file), 'utf8');
		const keyPattern = /(?:vscode\.)?l10n\.t\(\s*(['"])(.*?)\1/g;
		for (const match of source.matchAll(keyPattern)) {
			if (!baseKeys.has(match[2])) {
				missing.add(`${match[2]} (${file})`);
			}
		}
	}

	return [...missing].sort();
}

function localeFromFile(file) {
	const match = path.basename(file).match(/^(?:package\.nls|bundle\.l10n)\.(.+)\.json$/);
	return match?.[1];
}

async function checkGroup(label, baseFile, translationFiles) {
	const base = await readJson(baseFile);
	let failed = false;

	for (const file of translationFiles) {
		const differences = compareKeys(base, await readJson(file));
		if (differences.missing.length === 0 && differences.extra.length === 0) {
			continue;
		}

		failed = true;
		console.error(`${label}: ${file}`);
		if (differences.missing.length > 0) {
			console.error(`  Missing keys: ${differences.missing.join(', ')}`);
		}
		if (differences.extra.length > 0) {
			console.error(`  Extra keys: ${differences.extra.join(', ')}`);
		}
	}

	return failed;
}

const packageFiles = await collectFiles('.', /^package\.nls\..+\.json$/);
const runtimeFiles = await collectFiles('l10n', /^bundle\.l10n\..+\.json$/);
const packageLocales = packageFiles.map(localeFromFile);
const runtimeLocales = runtimeFiles.map(localeFromFile);

let failed = false;

if (packageLocales.join('\n') !== runtimeLocales.join('\n')) {
	failed = true;
	console.error('Package and runtime locale sets differ.');
	console.error(`  package.nls locales: ${packageLocales.join(', ')}`);
	console.error(`  runtime l10n locales: ${runtimeLocales.join(', ')}`);
}

failed = await checkGroup('Package translations', 'package.nls.json', packageFiles) || failed;
failed = await checkGroup('Runtime translations', 'l10n/bundle.l10n.json', runtimeFiles) || failed;

const missingRuntimeSourceKeys = await findMissingRuntimeSourceKeys('l10n/bundle.l10n.json');
if (missingRuntimeSourceKeys.length > 0) {
	failed = true;
	console.error('Runtime source strings missing from l10n/bundle.l10n.json:');
	console.error(`  ${missingRuntimeSourceKeys.join('\n  ')}`);
}

if (failed) {
	process.exitCode = 1;
} else {
	console.log(`i18n keys are consistent across ${packageFiles.length} localized language files.`);
}
