import { buttonClassName } from '@shared/ui/button'
import { PageMessage } from '@shared/ui/page-message'
import { Link } from '@tanstack/react-router'

/** Before the first season is computed. */
export const NoSeasonMessage = () => (
	<PageMessage
		actions={
			<Link className={buttonClassName({ variant: 'ghost' })} to="/methodology">
				Read the method
			</Link>
		}
		title="The first season has not been computed yet."
	>
		<p>
			The leaderboard appears after the first daily run, at 06:00 UTC, has
			counted a day of merged pull requests.
		</p>
	</PageMessage>
)
