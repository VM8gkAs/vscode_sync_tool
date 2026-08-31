import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { findNodeAtOffset, parseTree, type Node } from 'jsonc-parser';
import { CONFIG_FILENAME } from './config';
import { configText } from './default';
import { getConfigFieldTranslation } from './fieldTranslations';

type SchemaProperty = { $comment?: string };

let schemaProperties: Record<string, SchemaProperty> | undefined;

function getSchemaProperties(): Record<string, SchemaProperty> {
	if (!schemaProperties) {
		const schemaPath = path.join(__dirname, '..', 'schemas', 'sync_config.schema.json');
		const patternProperties = JSON.parse(fs.readFileSync(schemaPath, 'utf8')).definitions.environment.patternProperties;
		schemaProperties = Object.fromEntries(Object.entries(patternProperties).map(([pattern, value]) => [pattern.slice(1, -1), value as SchemaProperty]));
	}
	return schemaProperties!;
}

function localeKey(): string {
	const locale = vscode.env.language.toLowerCase();
	return locale === 'zh-hk' || locale === 'zh-mo' ? 'zh-tw' : locale;
}

function getEnvironmentObject(document: vscode.TextDocument, position: vscode.Position): Node | undefined {
	const tree = parseTree(document.getText());
	if (!tree) return undefined;
	let node = findNodeAtOffset(tree, document.offsetAt(position), true);
	while (node && node.type !== 'object') node = node.parent;
	return node?.parent?.type === 'property' && node.parent.parent?.type === 'object' && !node.parent.parent.parent ? node : undefined;
}

function descriptionFor(key: string): string {
	return getConfigFieldTranslation(key, localeKey()) || getSchemaProperties()[key]?.$comment || '';
}

export function ConfigDocumentationProvider(context: vscode.ExtensionContext) {
	const selector: vscode.DocumentSelector = { scheme: 'file', language: 'jsonc' };
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
		provideCompletionItems(document, position) {
			if (path.basename(document.uri.fsPath) !== CONFIG_FILENAME || !getEnvironmentObject(document, position)) return undefined;
			return Object.keys(getSchemaProperties()).map(key => {
				const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
				item.documentation = descriptionFor(key);
				item.insertText = new vscode.SnippetString(`"${key}": ${JSON.stringify(JSON.parse(configText)[key] ?? '')}`);
				return item;
			});
		}
	}));
	context.subscriptions.push(vscode.languages.registerHoverProvider(selector, {
		provideHover(document, position) {
			if (path.basename(document.uri.fsPath) !== CONFIG_FILENAME) return undefined;
			const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
			const key = range && document.getText(range);
			const description = key && descriptionFor(key);
			return description ? new vscode.Hover(new vscode.MarkdownString(description)) : undefined;
		}
	}));
}
