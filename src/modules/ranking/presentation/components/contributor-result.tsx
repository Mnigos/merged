import type { ReactNode } from 'react'
import type { ContributorResult } from '../leaderboard-view'
import { ResultCard } from './result-card'
import {
	BotResultCard,
	NoCountedRepositoryCard,
	NotFoundResultCard,
} from './result-states'

interface ContributorResultCardProps {
	readonly result: ContributorResult
	/** Share actions for a ranked result. */
	readonly actions?: ReactNode
}

/** The card for whichever outcome a lookup had. */
export const ContributorResultCard = ({
	result,
	actions,
}: Readonly<ContributorResultCardProps>) => {
	const { season, outcome } = result

	if (outcome.state === 'notFound')
		return <NotFoundResultCard login={outcome.login} season={season} />
	if (outcome.state === 'bot')
		return <BotResultCard contributor={outcome.contributor} season={season} />
	if (outcome.state === 'noCountedRepository')
		return (
			<NoCountedRepositoryCard
				contributor={outcome.contributor}
				season={season}
			/>
		)

	return (
		<ResultCard
			actions={actions}
			contributor={outcome.contributor}
			season={season}
		/>
	)
}
