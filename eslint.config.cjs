// Minimal eslint config for community node development.
// Cannot use the full @n8n/node-cli/eslint config because
// eslint-plugin-n8n-nodes-base@1.16.5 calls context.getFilename()
// which was removed in ESLint 10. @n8n/node-cli@0.23.1 ships ESLint 10.
// Upstream bug — revisit when the plugin is updated.

const tseslint = require('typescript-eslint');
const js = require('@eslint/js');

module.exports = tseslint.config(
	{ ignores: ['dist', 'node_modules'] },
	{
		files: ['src/**/*.ts'],
		extends: [
			js.configs.recommended,
			tseslint.configs.recommended,
		],
		rules: {
			'no-console': 'error',
			'prefer-spread': 'off',
		},
	},
);
