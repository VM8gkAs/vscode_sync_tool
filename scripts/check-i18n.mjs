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

if (failed) {
	process.exitCode = 1;
} else {
	console.log(`i18n keys are consistent across ${packageFiles.length} localized language files.`);
}
