import { Page } from '@shared/ui/page'
import { Link } from '@tanstack/react-router'
import { formatNumber, formatSeasonMonth } from '../format'
import type { SeasonView } from '../leaderboard-view'

const FOOTER_LINK = 'text-fg-2 transition-colors duration-150 hover:text-fg'

interface SiteFooterProps {
	readonly season: SeasonView | null
}

export const SiteFooter = ({ season }: Readonly<SiteFooterProps>) => (
	<footer>
		<Page>
			<div className="flex flex-wrap gap-x-6 gap-y-2.5 border-t border-line pt-5.5 pb-11 text-hint text-fg-3">
				{season && (
					<span>
						{formatNumber(season.mergedPullRequests)} merged PRs counted in{' '}
						{formatSeasonMonth(season.id)}
						{season.excludedBots !== null &&
							` · ${formatNumber(season.excludedBots)} bots excluded`}
					</span>
				)}
				<span>
					GH Archive data via the{' '}
					<a className={FOOTER_LINK} href="https://gharchive.open-digger.cn">
						OpenDigger mirror
					</a>
				</span>
				<Link className={FOOTER_LINK} to="/methodology">
					Methodology
				</Link>
				<span className="md:ml-auto">
					Built by{' '}
					<a className={FOOTER_LINK} href="https://github.com/Mnigos">
						@Mnigos
					</a>{' '}
					·{' '}
					<a className={FOOTER_LINK} href="https://github.com/Mnigos/merged">
						Source
					</a>
				</span>
			</div>
		</Page>
	</footer>
)
