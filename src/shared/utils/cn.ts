/** Joins class names, skipping falsy ones: `cn('a', flag && 'b')`. */
export const cn = (
	...classNames: readonly (string | false | null | undefined)[]
) => classNames.filter(Boolean).join(' ')
