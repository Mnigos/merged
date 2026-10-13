import { readFileSync } from 'node:fs'
import { describe, expect, it } from '@effect/vitest'
import { Result } from 'effect'
import { parsePartLabels } from './part-labels.helper'

const WORKFLOWS = [
	'pipeline.yml',
	'backfill.yml',
] as const satisfies readonly string[]

function readWorkflow(name: string) {
	return readFileSync(
		new URL(`../../.github/workflows/${name}`, import.meta.url),
		'utf-8'
	)
}

describe.each(WORKFLOWS)('%s day parts', name => {
	const workflow = readWorkflow(name)
	const matrixParts = [...workflow.matchAll(/^\s+part:\s*\[([^\]]*)\]/gmu)].map(
		([, list = '']) =>
			[...list.matchAll(/'([^']+)'/gu)].map(([, label]) => label)
	)
	const mergeParts = [
		...workflow.matchAll(/merge-day\.ts\b.*--parts (\S+)/gu),
	].map(([, parts = '']) => parts)

	it('ingests exactly the parts merge-day merges', () => {
		expect(matrixParts.length).toBeGreaterThan(0)
		expect(mergeParts.length).toBeGreaterThan(0)
		for (const parts of matrixParts)
			for (const merged of mergeParts)
				expect(new Set(parts)).toEqual(new Set(merged.split(',')))
	})

	it('passes merge-day labels that cover every hour once', () => {
		for (const parts of mergeParts)
			expect(parsePartLabels(parts)).toEqual(Result.succeed(parts.split(',')))
	})
})
