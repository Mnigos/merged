import { MethodologyArticle } from '@modules/ranking/presentation/components/methodology-article'
import {
	toPageHead,
	toPageTitle,
} from '@modules/ranking/presentation/page-head'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/methodology')({
	head: () =>
		toPageHead({
			title: toPageTitle('Methodology'),
			description:
				'How merged scores a season: merged pull requests weighted by repository standing, diminishing returns per organisation, bots excluded.',
		}),
	component: MethodologyArticle,
})
