import { ChevronIcon } from '@shared/ui/icons'
import { Page } from '@shared/ui/page'
import { Link } from '@tanstack/react-router'

const CODE = 'font-mono text-code font-medium text-fg'

/** The method in four short answers, with a link to the full page. */
export const MethodSection = () => (
	<section
		aria-labelledby="method-title"
		className="border-t border-line pt-7 pb-14"
	>
		<Page className="grid gap-5.5 md:grid-cols-[1fr_1.4fr] md:gap-12">
			<div>
				<h2
					className="max-w-[20ch] text-title leading-[1.2] font-semibold tracking-[-0.03em]"
					id="method-title"
				>
					Every point is a merge into someone else’s repository.
				</h2>
				<Link
					className="mt-4 inline-flex items-center gap-1 text-sm text-fg-2 transition-colors duration-150 hover:text-fg"
					to="/methodology"
				>
					Read the full method
					<ChevronIcon className="size-3.5" />
				</Link>
			</div>
			<dl className="grid gap-3.5 md:grid-cols-2 md:gap-x-8 md:gap-y-4.5 [&_dd]:mt-0.75 [&_dd]:max-w-[52ch] [&_dd]:text-sm [&_dd]:text-pretty [&_dd]:text-fg-2 [&_dt]:text-sm [&_dt]:font-semibold">
				<div>
					<dt>What counts</dt>
					<dd>
						Pull requests merged into a repository you don’t own. Merged by
						someone else counts in full, self-merged counts half, each weighted
						by <code className={CODE}>log10(stars + contributors + 10)</code>.
					</dd>
				</div>
				<div>
					<dt>What doesn’t</dt>
					<dd>
						Your own repositories, bots by login pattern and list, and
						repositories nobody else touched: one counts once someone besides
						you contributed to it or starred it this season, or it has 10 stars.
					</dd>
				</div>
				<div>
					<dt>Diminishing returns</dt>
					<dd>
						All of an owner’s repositories share one square root, so a hundred
						small pull requests into one organisation count like ten. Work for
						different owners adds up.
					</dd>
				</div>
				<div>
					<dt>The season</dt>
					<dd>
						A calendar month in UTC, recomputed daily from GH Archive. Ranks are
						provisional until the month closes.
					</dd>
				</div>
			</dl>
		</Page>
	</section>
)
