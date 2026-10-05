import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
	...ultracite,
	arrowParens: 'avoid',
	insertFinalNewline: true,
	proseWrap: 'preserve',
	semi: false,
	singleQuote: true,
	useTabs: true,
	sortImports: { newlinesBetween: false, partitionByNewline: true },
	sortTailwindcss: {
		functions: ['cn', 'cva', 'clsx', 'twMerge'],
		stylesheet: './src/styles.css',
	},
	ignorePatterns: [
		...(ultracite.ignorePatterns ?? []),
		'.claude/**',
		'.agents/**',
		'.codex/**',
		'.impeccable/**',
		'docs/**',
		'**/*.svg',
		'**/node_modules',
		'**/.nitro',
		'**/.output',
		'**/routeTree.gen.ts',
	],
	overrides: [
		{
			files: ['**/*.json', '**/*.jsonc', '**/*.webmanifest'],
			options: { useTabs: false },
		},
	],
})
