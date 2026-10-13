import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from '@effect/vitest'
import { lacksRoleSuffix } from './file-names.helper'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SOURCE_DIRECTORIES = [
	'src',
	'scripts',
] as const satisfies readonly string[]

const listFiles = (directory: string) =>
	readdirSync(`${ROOT}${directory}`, {
		recursive: true,
		encoding: 'utf-8',
	}).map(path => `${directory}/${path.replaceAll('\\', '/')}`)

describe('lacksRoleSuffix', () => {
	it.each([
		'src/foo.ts',
		'src/shared/ui/button.tsx',
		'src/modules/ranking/domain/scoring.ts',
		'scripts/lib/reports.ts',
	])('flags the bare name %s', path => {
		expect(lacksRoleSuffix(path)).toBe(true)
	})

	it.each([
		'src/modules/ranking/domain/scoring.helper.ts',
		'src/modules/ranking/domain/scoring.helper.spec.ts',
		'src/shared/ui/button.component.tsx',
		'src/routes/u.$login.tsx',
		'src/router.tsx',
		'src/routeTree.gen.ts',
		'scripts/pipeline.ts',
		'src/styles.css',
	])('accepts %s', path => {
		expect(lacksRoleSuffix(path)).toBe(false)
	})
})

describe('source file names', () => {
	it('end with a role suffix in src/ and scripts/', () => {
		expect(
			SOURCE_DIRECTORIES.flatMap(listFiles).filter(lacksRoleSuffix)
		).toEqual([])
	})
})
