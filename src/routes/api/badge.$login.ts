import { toBadgeResponse } from '@modules/share/presentation/badge.server'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/badge/$login')({
	server: {
		handlers: {
			GET: async ({ params }) => await toBadgeResponse(params.login),
		},
	},
})
