import { Leaderboard } from '@modules/ranking/application/leaderboard.service'
import { GITHUB_LOGIN_PATTERN } from '@shared/github/login-pattern'
import { Effect, Option } from 'effect'
import { runServer } from '@/runtime/app-runtime.server'
import { toBadge, UNAVAILABLE_BADGE, type Badge } from '../domain/badge'

/** Badges are cached for an hour by browsers, shields.io and the CDN. */
const BADGE_CACHE_CONTROL = 'public, max-age=3600'

/** A contributor's badge in the newest season, or `null` before the first season is built. */
const readBadge = Effect.fn('Badge.read')(function* (login: string) {
	const leaderboard = yield* Leaderboard
	const index = yield* leaderboard.index()
	const seasonId = Option.flatMapNullishOr(index, file => file.latest)
	if (Option.isNone(seasonId)) return null
	const entry = yield* leaderboard.contributor(seasonId.value, login)

	return toBadge(seasonId.value, Option.getOrUndefined(entry)) satisfies Badge
})

/**
 * Response of `/api/badge/<login>`, run on the app runtime directly: the
 * badge JSON, cached for an hour. A login that breaks GitHub's rules is a 404
 * and a read failure a 503, both as error badges that are not cached.
 */
export async function toBadgeResponse(login: string) {
	if (!GITHUB_LOGIN_PATTERN.test(login))
		return Response.json(
			{ ...UNAVAILABLE_BADGE, message: 'not a GitHub login' },
			{ status: 404, headers: { 'Cache-Control': 'no-store' } }
		)
	try {
		const badge = await runServer(readBadge(login))

		return Response.json(badge ?? UNAVAILABLE_BADGE, {
			headers: { 'Cache-Control': BADGE_CACHE_CONTROL },
		})
	} catch {
		return Response.json(UNAVAILABLE_BADGE, {
			status: 503,
			headers: { 'Cache-Control': 'no-store' },
		})
	}
}
