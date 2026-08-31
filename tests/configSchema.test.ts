import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { getExampleText } from '../src/config/default';
import { getConfigFieldTranslation } from '../src/config/fieldTranslations';

describe('sync_config.jsonc schema contribution', () => {
	it('registers the bundled schema and keeps new configuration files comment-free', () => {
		const projectRoot = path.resolve(__dirname, '..', '..');
		const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
		const registration = manifest.contributes.jsonValidation.find((entry: { fileMatch: string }) => entry.fileMatch === 'sync_config.jsonc');

		assert.deepStrictEqual(registration, {
			fileMatch: 'sync_config.jsonc',
			url: './schemas/sync_config.schema.json'
		});
		assert.strictEqual(getExampleText(), '{}\n');
	});

	it('uses validation-only patternProperties with complete runtime documentation translations', () => {
		const projectRoot = path.resolve(__dirname, '..', '..');
		const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, 'schemas', 'sync_config.schema.json'), 'utf8'));
		const environment = schema.definitions.environment;
		const properties = environment.patternProperties as Record<string, { description?: string; $comment?: string; enum?: string[] }>;
		const publicKeys = Object.keys(properties).map(pattern => {
			assert.match(pattern, /^\^.+\$$/, `schema key ${pattern} must be an exact patternProperty`);
			return pattern.slice(1, -1);
		});

		assert.strictEqual(environment.properties, undefined, 'schema flags must stay in patternProperties to avoid duplicate built-in completions');
		assert.ok(publicKeys.length > 0, 'schema must expose public configuration flags');
		for (const key of publicKeys) {
			assert.strictEqual(properties[`^${key}$`]?.description, undefined, `${key} must not add a duplicate schema hover`);
			assert.match(properties[`^${key}$`]?.$comment ?? '', /[A-Za-z]/, `${key} needs an English schema comment`);
		}
		assert.deepStrictEqual(properties['^type$'].enum, ['ftp', 'sftp', 'ssh']);
		assert.deepStrictEqual(properties['^skipCompareMode$'].enum, ['size+mtime', 'size', 'mtime']);

		for (const locale of ['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-br', 'ru', 'tr', 'zh-cn', 'zh-tw']) {
			for (const key of publicKeys) {
				assert.ok(getConfigFieldTranslation(key, locale)?.trim(), `${locale} needs a translation for ${key}`);
			}
		}
	});
});
