import { Button, buttonClassName } from '@shared/ui/button'
import { PageMessage } from '@shared/ui/page-message'
import { Link, useRouter } from '@tanstack/react-router'

/** A page or result that does not exist. */
export const NotFoundMessage = () => (
	<PageMessage
		actions={
			<Link className={buttonClassName()} to="/">
				Back to the leaderboard
			</Link>
		}
		title="Nothing got merged here."
	>
		<p>
			This page does not exist. The leaderboard and the lookup are on the home
			page.
		</p>
	</PageMessage>
)

interface InvalidLoginMessageProps {
	readonly login: string
}

/** A `/u/<login>` address whose login breaks GitHub's rules. */
export const InvalidLoginMessage = ({
	login,
}: Readonly<InvalidLoginMessageProps>) => (
	<PageMessage
		actions={
			<Link className={buttonClassName()} hash="login" to="/">
				Look up a login
			</Link>
		}
		title="That is not a GitHub login."
	>
		<p>
			<code>{login}</code> cannot be a GitHub account: logins are up to 39
			letters, digits and hyphens, and do not start with a hyphen.
		</p>
	</PageMessage>
)

/** Season files could not be read, or something else failed while loading. */
export const ErrorMessage = () => {
	const router = useRouter()

	return (
		<PageMessage
			actions={
				<>
					<Button onClick={() => void router.invalidate()}>Try again</Button>
					<Link className={buttonClassName({ variant: 'ghost' })} to="/">
						Go home
					</Link>
				</>
			}
			title="The leaderboard did not load."
		>
			<p>
				Something went wrong while reading this season. It is usually brief; try
				again in a minute.
			</p>
		</PageMessage>
	)
}
