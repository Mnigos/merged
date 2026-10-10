import { Page } from '@shared/ui/page'
import type { ReactNode } from 'react'

const CODE = 'font-mono text-[0.86em] font-medium text-fg'
const BLOCK =
	'my-5 overflow-x-auto rounded-xl border border-line bg-bg-2 px-4 py-3.5 font-mono text-code leading-relaxed text-fg shadow-raised'
const LIST =
	'my-4 grid list-disc gap-1.5 pl-5 marker:text-fg-3 [&_b]:font-semibold [&_b]:text-fg'

const FORMULA = `repoTerm   = Σ weight × merged pull requests × log10(standing + 10)²
ownerScore = √(Σ repoTerm over the owner's repositories)
score      = 100 × Σ ownerScore over owners, rounded`

const EXAMPLE = `16 pull requests into one owner's repositories   √16      = 4
16 pull requests spread over 4 owners, 4 each    4 × √4   = 8`

interface SectionProps {
	readonly id: string
	readonly title: string
	readonly children: ReactNode
}

const Section = ({ id, title, children }: Readonly<SectionProps>) => (
	<section aria-labelledby={id} className="mt-11">
		<h2 className="text-lead font-semibold tracking-[-0.02em] text-fg" id={id}>
			{title}
		</h2>
		<div className="mt-2.5 grid gap-3.5">{children}</div>
	</section>
)

/** The scoring method, plainly, for `/methodology`. */
export const MethodologyArticle = () => (
	<Page>
		<article className="max-w-[65ch] pt-12 pb-16 text-body leading-[1.7] text-pretty text-fg-2 md:pt-18">
			<h1 className="text-display font-semibold text-balance text-fg">
				Methodology
			</h1>
			<p className="mt-4 text-base text-fg-2 md:text-lead">
				merged ranks open source contributors by pull requests merged into
				repositories they don’t own. A self-merge counts half; bots and your own
				repositories count for nothing. This page is the whole method; the code
				and its tests are public.
			</p>

			<Section id="data" title="Where the data comes from">
				<p>
					Every public GitHub event lands in{' '}
					<a
						className="text-fg underline decoration-line-2 hover:decoration-fg-2"
						href="https://www.gharchive.org"
					>
						GH Archive
					</a>
					, one file per hour. The official GH Archive feed has lost most events
					since 2026, so merged counts come from{' '}
					<a
						className="text-fg underline decoration-line-2 hover:decoration-fg-2"
						href="https://gharchive.open-digger.cn"
					>
						OpenDigger’s archive
					</a>{' '}
					of the same public events. Once a day at 06:00 UTC merged reads the
					previous day’s 24 files, keeps merged pull requests and stars, and
					recomputes the season. Nothing is read from private repositories.
				</p>
			</Section>

			<Section id="counts" title="What counts">
				<p>
					A merged pull request into a repository the author does not own. Who
					merged it sets its weight:
				</p>
				<ul className={LIST}>
					<li>
						<b>Merged by someone else</b>: 1
					</li>
					<li>
						<b>Self-merged</b>, in a repository you can write to but do not own:
						0.5
					</li>
					<li>
						<b>Own repository</b>, owned by your login: 0
					</li>
				</ul>
				<p>Commits, issues, reviews and closed pull requests never count.</p>
			</Section>

			<Section id="formula" title="The formula">
				<pre className={BLOCK}>
					<code>{FORMULA}</code>
				</pre>
				<p>
					<b className="font-semibold text-fg">Standing</b> is a repository’s
					popularity: its stars plus the outside contributors it had this
					season. The <code className={CODE}>+ 10</code> keeps a brand-new
					repository at a weight of about 1, so one merged pull request into an
					unknown repository is worth about 100 points and one into a
					100,000-star repository about 500.
				</p>
			</Section>

			<Section id="diminishing" title="Diminishing returns per organisation">
				<p>
					All of an owner’s repositories share one square root. A hundred
					trivial pull requests into one project count like ten, and spreading
					them over one organisation’s small repositories does not help. Work
					for different owners still adds up in full. With repositories of equal
					standing, the second contributor below scores twice the first:
				</p>
				<pre className={BLOCK}>
					<code>{EXAMPLE}</code>
				</pre>
			</Section>

			<Section id="counted" title="When a repository counts">
				<p>
					A repository counts once someone besides you contributed to it or
					starred it this season, or it has at least 10 stars. Precisely:
					another outside contributor got merged into it this season, it
					received at least 3 stars this season, or GitHub reports at least 10
					stars.
				</p>
				<p>
					An uncounted repository stays in your breakdown at 0 points. If none
					of your repositories counts yet, your result is shown but not ranked.
				</p>
			</Section>

			<Section id="bots" title="Bots and exclusions">
				<p>
					Bots never rank and do not count as contributors to a repository. A
					login is treated as a bot when it ends in{' '}
					<code className={CODE}>[bot]</code>; ends in{' '}
					<code className={CODE}>-bot</code>, <code className={CODE}>_bot</code>
					, <code className={CODE}>.bot</code> or{' '}
					<code className={CODE}>robot</code>; ends in{' '}
					<code className={CODE}>-ci</code> or{' '}
					<code className={CODE}>-queue</code>; starts with{' '}
					<code className={CODE}>svc-</code> or{' '}
					<code className={CODE}>bot-</code>; has{' '}
					<code className={CODE}>copilot</code> as a word; or is on a known list
					that includes <code className={CODE}>dependabot</code>,{' '}
					<code className={CODE}>renovate</code> and{' '}
					<code className={CODE}>weblate</code>. Names like{' '}
					<code className={CODE}>talbot</code> stay human.
				</p>
				<p>
					Repositories of a few owners that run merge queue demos, such as{' '}
					<code className={CODE}>merge-demo</code>, never count.
				</p>
			</Section>

			<Section id="seasons" title="Seasons, ranks and percentiles">
				<p>
					A season is one calendar month in UTC. While the month runs the season
					is <b className="font-semibold text-fg">provisional</b>: it is
					recomputed every day and ranks move. Once the month is over and its
					last day is in, the season is{' '}
					<b className="font-semibold text-fg">final</b> and no longer changes.
				</p>
				<p>
					Equal scores share a rank. The percentile is the share of ranked
					contributors with a lower score, rounded down to one decimal, so the
					best result reads top 0.1%.
				</p>
			</Section>

			<Section id="limits" title="Known limits">
				<ul className={LIST}>
					<li>
						A day counts only after GH Archive publishes it and the daily run
						picks it up. Each season shows how many of its days are counted;
						days that never arrive are skipped, not estimated.
					</li>
					<li>
						Since 2025 GH Archive no longer records who merged a pull request.
						merged asks GitHub for the merger of the top candidates only; for
						everyone else a merge into someone else’s repository counts as
						merged by someone else, so a self-merge there counts in full.
					</li>
					<li>
						Names and locations come from the GitHub profiles of top candidates,
						so the Poland board lists only contributors whose profile was
						fetched and names a place in Poland.
					</li>
					<li>Private repositories and work outside GitHub are invisible.</li>
				</ul>
			</Section>

			<Section id="source" title="Source">
				<p>
					The scoring code, its tests and the decision records behind it are at{' '}
					<a
						className="text-fg underline decoration-line-2 hover:decoration-fg-2"
						href="https://github.com/Mnigos/merged"
					>
						github.com/Mnigos/merged
					</a>
					.
				</p>
			</Section>
		</article>
	</Page>
)
