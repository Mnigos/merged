import { describe, expect, it } from '@effect/vitest'
import { isExcludedRepository } from './excluded-repositories'

describe('isExcludedRepository', () => {
	it('excludes every repository of a listed owner, ignoring case', () => {
		expect(isExcludedRepository('merge-demo/mergequeue-bazel')).toBe(true)
		expect(isExcludedRepository('Merge-Demo/anything')).toBe(true)
	})

	it('keeps other repositories, including look-alike names', () => {
		expect(isExcludedRepository('acme/merge-demo')).toBe(false)
		expect(isExcludedRepository('merge-demo-fork/x')).toBe(false)
		expect(isExcludedRepository('nixos/nixpkgs')).toBe(false)
	})
})
