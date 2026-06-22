const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
	{
		ignores: [
			'out/**',
			'dist/**',
			'.test-out/**',
			'node_modules/**',
			'**/*.d.ts'
		]
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': tsPlugin
		},
		rules: {
			'@typescript-eslint/naming-convention': 'warn',
			curly: 'warn',
			eqeqeq: 'warn',
			'no-throw-literal': 'warn',
			semi: ['warn', 'always']
		}
	}
];
