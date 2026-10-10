import { Button } from '@shared/ui/button'
import { SearchIcon } from '@shared/ui/icons'
import { cn } from '@shared/utils/cn'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useState, type ReactNode, type SubmitEvent } from 'react'
import { toLookupLogin } from '../lookup-login'

/** Id of the lookup field, the target of the header link and `⌘K`. */
export const LOOKUP_INPUT_ID = 'login'

const INVALID_LOGIN_MESSAGE =
	'That is not a GitHub login. Logins use letters, digits and hyphens.'

/** Focuses the field on `⌘K` or `Ctrl+K` for as long as it is mounted. */
function bindLookupShortcut(input: HTMLInputElement | null) {
	if (!input) return undefined
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey))
			return
		event.preventDefault()
		input.focus()
		input.select()
	}
	window.addEventListener('keydown', onKeyDown)

	return () => window.removeEventListener('keydown', onKeyDown)
}

interface LookupFormProps {
	readonly defaultLogin?: string
	readonly hint: ReactNode
}

/**
 * The login lookup as a command bar. A GET form to `/u`, so it works without
 * JavaScript; with it, the result opens through the router.
 */
export const LookupForm = ({
	defaultLogin,
	hint,
}: Readonly<LookupFormProps>) => {
	const navigate = useNavigate()
	const isNavigating = useRouterState({
		select: state => state.status === 'pending',
	})
	const [error, setError] = useState<string>()

	function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault()
		const value = new FormData(event.currentTarget).get('login')
		const login = toLookupLogin(typeof value === 'string' ? value : '')
		if (!login) {
			setError(INVALID_LOGIN_MESSAGE)
			return
		}
		setError(undefined)
		void navigate({ to: '/u/$login', params: { login } })
	}

	return (
		<form
			action="/u"
			className="mt-6 grid gap-2 md:max-w-115"
			method="get"
			onSubmit={handleSubmit}
			role="search"
		>
			<label
				className={cn(
					'flex h-12 items-center gap-2.5 rounded-xl border bg-bg-2 pr-1.5 pl-3.5 shadow-field transition-[border-color,box-shadow] duration-150 focus-within:border-merged-line focus-within:shadow-[0_0_0_3px_var(--color-merged-soft)]',
					error ? 'border-down/60' : 'border-line-2'
				)}
				htmlFor={LOOKUP_INPUT_ID}
			>
				<SearchIcon className="size-4 shrink-0 text-fg-3" />
				<input
					aria-describedby="lookup-hint"
					aria-invalid={error ? true : undefined}
					aria-label="GitHub login"
					autoCapitalize="none"
					autoComplete="off"
					autoCorrect="off"
					className="min-w-0 flex-1 bg-transparent font-mono text-base font-medium tracking-[-0.01em] text-fg outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-fg-3"
					defaultValue={defaultLogin}
					enterKeyHint="search"
					id={LOOKUP_INPUT_ID}
					name="login"
					onChange={() => setError(undefined)}
					placeholder="GitHub login"
					ref={bindLookupShortcut}
					required
					spellCheck={false}
				/>
				<Button aria-busy={isNavigating || undefined} type="submit">
					{isNavigating ? 'Checking' : 'Check'}
				</Button>
			</label>
			<p
				aria-live="polite"
				className={cn(
					'text-hint [&_b]:font-medium',
					error ? 'text-down' : 'text-fg-3 [&_b]:text-fg-2'
				)}
				id="lookup-hint"
			>
				{error ?? hint}
			</p>
		</form>
	)
}
