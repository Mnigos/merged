import { defineConfig, type OxlintOverride } from 'oxlint'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'
import tanstack from 'ultracite/oxlint/tanstack'

const DISABLED_RULES = {
	'class-methods-use-this':
		'Effect services and error classes implement interfaces without this',
	'func-name-matching':
		'named function expressions keep their own descriptive names',
	'func-names': 'anonymous function expressions are fine as callbacks',
	'max-classes-per-file':
		'Effect tagged errors and schema classes are grouped per module',
	'no-await-in-loop':
		'sequential batch drains, retries and rate-limited calls are intentional',
	'no-plusplus': 'increment operators are idiomatic in counters and loops',
	'prefer-named-capture-group':
		'positional groups are clearer in short regexes',
	'require-await': 'superseded by typescript/require-await',
	'import/consistent-type-specifier-style':
		'inline type specifiers are allowed in mixed imports',
	'promise/avoid-new':
		'wrapping timers, streams and callback APIs needs new Promise',
	'promise/prefer-await-to-callbacks': 'event emitters and React callbacks',
	'promise/prefer-await-to-then':
		'then and catch chains serve fire-and-forget void promises',
	'react/function-component-definition': 'concise arrow components are allowed',
	'react/jsx-handler-names':
		'handler props follow component APIs, not a handle prefix',
	'react/no-clone-element': 'Radix and shadcn slot patterns clone children',
	'react/no-react-children': 'Radix and shadcn slot patterns inspect children',
	'typescript/no-confusing-void-expression':
		'concise void-returning arrow callbacks',
	'typescript/non-nullable-type-assertion-style':
		'pushes towards non-null assertions',
	'typescript/prefer-nullish-coalescing':
		'|| is used for intentional all-falsy checks',
	'typescript/strict-boolean-expressions':
		'truthiness checks and || fallbacks are intentional',
	'typescript/unbound-method': 'Vitest spies and method references',
	'unicorn/import-style': 'named imports from Node builtins are the convention',
	'unicorn/no-array-reduce': 'reduce is accepted for aggregations',
	'unicorn/no-useless-undefined': 'explicit undefined at API boundaries',
	'unicorn/prefer-number-coercion':
		'Number() turns unit strings like 42% into NaN where parseFloat is needed',
	'unicorn/prefer-ternary': 'early returns are preferred over ternaries',
	'unicorn/switch-case-braces': 'no braces for single-statement blocks',
} as const satisfies Record<string, string>

const PRESETS = [core, react, tanstack]

const SPEC_PLUGINS = [
	...new Set([
		...PRESETS.flatMap(preset => preset.plugins ?? []),
		'vitest',
	] satisfies OxlintOverride['plugins']),
]

export default defineConfig({
	extends: PRESETS,
	ignorePatterns: [
		...(core.ignorePatterns ?? []),
		'.claude/**',
		'.agents/**',
		'.codex/**',
		'.impeccable/**',
		'docs/**',
		'**/node_modules',
		'**/.nitro',
		'**/.output',
		'**/routeTree.gen.ts',
	],
	options: { typeAware: true },
	env: { browser: true, node: true, es2024: true },
	globals: { Bun: 'readonly' },
	rules: {
		...Object.fromEntries(
			Object.keys(DISABLED_RULES).map(rule => [rule, 'off'])
		),
		curly: 'off',
		'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
		'no-nested-ternary': 'off',
		'no-undef': 'error',
		'no-use-before-define': [
			'error',
			{
				classes: false,
				functions: false,
				ignoreTypeReferences: true,
				typedefs: false,
				variables: false,
			},
		],
		'no-void': 'off',
		'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
		'jsx-a11y/prefer-tag-over-role': 'off',
		'oxc/no-barrel-file': 'off',
		'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
		'react/no-array-index-key': 'warn',
		'react/no-danger': 'off',
		'typescript/require-await': 'warn',
		'typescript/consistent-type-imports': [
			'error',
			{ disallowTypeAnnotations: false },
		],
		'typescript/no-empty-interface': ['error', { allowSingleExtends: true }],
		'typescript/no-extraneous-class': [
			'error',
			{
				allowConstructorOnly: true,
				allowEmpty: true,
				allowWithDecorator: true,
			},
		],
		'typescript/no-misused-promises': [
			'error',
			{ checksVoidReturn: { attributes: false } },
		],
		'typescript/no-non-null-assertion': 'off',
		'typescript/parameter-properties': 'off',
		'typescript/only-throw-error': [
			'error',
			{
				allow: [
					{
						from: 'package',
						package: '@tanstack/router-core',
						name: ['Redirect', 'NotFoundError'],
					},
				],
			},
		],
	},
	overrides: [
		{
			files: ['**/*.spec.ts', '**/*.spec.tsx'],
			env: { vitest: true },
			plugins: SPEC_PLUGINS,
			rules: {
				'vitest/expect-expect': 'off',
				'vitest/max-nested-describe': 'error',
				'vitest/no-conditional-expect': 'off',
				'vitest/no-disabled-tests': 'error',
				'vitest/no-duplicate-hooks': 'error',
				'vitest/no-focused-tests': 'error',
				'vitest/prefer-snapshot-hint': 'off',
				'vitest/require-mock-type-parameters': 'off',
				'vitest/require-to-throw-message': 'off',
				'vitest/valid-expect': 'off',
				'vitest/warn-todo': 'off',
				'typescript/await-thenable': 'off',
				'typescript/dot-notation': 'off',
				'typescript/no-explicit-any': 'off',
				'typescript/no-invalid-void-type': 'off',
				'typescript/no-misused-promises': [
					'error',
					{ checksVoidReturn: false },
				],
			},
		},
		{
			files: [
				'**/*.spec.ts',
				'**/*.spec.tsx',
				'**/tests/**',
				'**/vitest.*.ts',
				'**/vitest.*.tsx',
			],
			rules: { 'typescript/require-await': 'off' },
		},
		{
			files: ['src/**', 'scripts/**'],
			rules: { 'oxc/no-barrel-file': ['error', { threshold: 0 }] },
		},
		{
			files: ['**/*.error.ts'],
			rules: { 'unicorn/throw-new-error': 'off' },
		},
		{
			files: ['src/modules/*/domain/**'],
			rules: {
				'no-restricted-imports': [
					'error',
					{
						patterns: [
							{
								group: [
									'**/application/**',
									'**/infrastructure/**',
									'**/presentation/**',
									'react',
									'@tanstack/**',
								],
								message: 'domain stays pure, see ARCHITECTURE.md',
							},
						],
					},
				],
			},
		},
		{
			files: ['src/shared/**'],
			rules: {
				'no-restricted-imports': [
					'error',
					{
						patterns: [
							{
								group: ['@modules/**', '**/modules/**'],
								message: 'the shared kernel never imports modules',
							},
						],
					},
				],
			},
		},
		{
			files: ['src/routes/**', 'src/modules/*/presentation/components/**'],
			rules: {
				'no-restricted-imports': [
					'error',
					{
						paths: [
							{
								name: 'effect',
								message:
									'React stays plain; call a server function instead, see ARCHITECTURE.md',
							},
						],
					},
				],
			},
		},
	],
})
