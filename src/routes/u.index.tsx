import {
	toLookupTarget,
	validateLookupSearch,
} from '@modules/ranking/presentation/search-params'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/u/')({
	validateSearch: validateLookupSearch,
	beforeLoad: ({ location }) => {
		const login = toLookupTarget(location.searchStr)
		if (!login) throw redirect({ to: '/', hash: 'login' })

		throw redirect({ to: '/u/$login', params: { login } })
	},
})
