import { githubLoginSchema } from '@shared/schema/github-login'
import { seasonIdSchema } from '@shared/schema/season-id'
import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl, setResponseStatus } from '@tanstack/react-start/server'
import { Effect, Option, Schema } from 'effect'
import { runServer, type AppServices } from '@/runtime/app-runtime.server'
import { Leaderboard } from '../application/leaderboard.service'
import { contributorBoardIdSchema } from '../domain/files/board-file'
import {
	findSeason,
	toBoardView,
	toContributorOutcome,
	toRepositoryRows,
	toSeasonView,
	type BoardResult,
	type ContributorResult,
	type RepositoryBoardResult,
	type SeasonView,
} from './leaderboard-view'
import { isGitHubLogin } from './lookup-login'
import { ROW_COUNTS } from './search-params'

/** What a visitor sees when season files cannot be read; no paths, no provider details. */
export const LOAD_FAILED_MESSAGE =
	'The leaderboard could not be loaded. Try again in a minute.'

/**
 * Runs a read on the app runtime. `none` becomes a 404; any failure is logged
 * on the server and reaches the visitor as a 500 with a short message.
 */
async function runRead<TValue>(
	effect: Effect.Effect<Option.Option<TValue>, unknown, AppServices>
) {
	let result: Option.Option<TValue>
	try {
		result = await runServer(
			effect.pipe(
				Effect.tapCause(cause =>
					Effect.logError('Leaderboard read failed', cause)
				)
			)
		)
	} catch {
		setResponseStatus(500)
		throw new Error(LOAD_FAILED_MESSAGE)
	}
	if (Option.isNone(result)) throw notFound()

	return result.value
}

/** The newest season, or `null` before the first build, and the server time for relative labels. */
export const getSeasonOverview = createServerFn({ method: 'GET' }).handler(
	async () =>
		await runRead(
			Effect.gen(function* () {
				const index = yield* (yield* Leaderboard).index()
				const entry = Option.flatMapNullishOr(index, findSeason)

				return Option.some({
					season: Option.match(entry, {
						onNone: (): SeasonView | null => null,
						onSome: toSeasonView,
					}),
					renderedAt: Date.now(),
				})
			})
		)
)

const rowCountSchema = Schema.Literals(ROW_COUNTS)

const boardInputSchema = Schema.Struct({
	season: Schema.optional(seasonIdSchema),
	board: contributorBoardIdSchema,
	rows: Schema.optional(rowCountSchema),
})

/** A contributor board of a season, the newest by default; a 404 for an unknown season. */
export const getBoard = createServerFn({ method: 'GET' })
	.validator(Schema.toStandardSchemaV1(boardInputSchema))
	.handler(
		async ({ data }) =>
			await runRead(
				Effect.gen(function* () {
					const leaderboard = yield* Leaderboard
					const entry = Option.flatMapNullishOr(
						yield* leaderboard.index(),
						index => findSeason(index, data.season)
					)
					if (Option.isNone(entry)) return Option.none()
					const file = yield* leaderboard.board(entry.value.id, data.board)
					if (Option.isNone(file)) return Option.none()

					return Option.some<BoardResult>({
						season: toSeasonView(entry.value),
						board: toBoardView(file.value, data.rows ?? 25),
					})
				})
			)
	)

const repositoryBoardInputSchema = Schema.Struct({
	season: Schema.optional(seasonIdSchema),
	rows: Schema.optional(rowCountSchema),
})

/** The repository board of a season, the newest by default; a 404 for an unknown season. */
export const getRepositoryBoard = createServerFn({ method: 'GET' })
	.validator(Schema.toStandardSchemaV1(repositoryBoardInputSchema))
	.handler(
		async ({ data }) =>
			await runRead(
				Effect.gen(function* () {
					const leaderboard = yield* Leaderboard
					const entry = Option.flatMapNullishOr(
						yield* leaderboard.index(),
						index => findSeason(index, data.season)
					)
					if (Option.isNone(entry)) return Option.none()
					const file = yield* leaderboard.repositories(entry.value.id)
					if (Option.isNone(file)) return Option.none()

					return Option.some<RepositoryBoardResult>({
						season: toSeasonView(entry.value),
						rows: toRepositoryRows(file.value, data.rows ?? 25),
						availableRows: file.value.rows.length,
					})
				})
			)
	)

const contributorInputSchema = Schema.Struct({
	season: Schema.optional(seasonIdSchema),
	login: githubLoginSchema,
})

/**
 * One contributor's result in a season, the newest by default. A login that
 * breaks GitHub's rules or an unknown season is a 404; a login without merged
 * pull requests is a `notFound` outcome, not an error.
 */
export const getContributorResult = createServerFn({ method: 'GET' })
	.validator(Schema.toStandardSchemaV1(contributorInputSchema))
	.handler(async ({ data }) => {
		if (!isGitHubLogin(data.login)) throw notFound()
		const login = data.login.toLowerCase()
		const url = new URL(`/u/${login}`, getRequestUrl({ xForwardedHost: true }))
			.href

		return await runRead(
			Effect.gen(function* () {
				const leaderboard = yield* Leaderboard
				const entry = Option.flatMapNullishOr(
					yield* leaderboard.index(),
					index => findSeason(index, data.season)
				)
				if (Option.isNone(entry)) return Option.none()
				const contributor = yield* leaderboard.contributor(
					entry.value.id,
					login
				)

				return Option.some<ContributorResult>({
					season: toSeasonView(entry.value),
					url,
					outcome: toContributorOutcome(
						login,
						Option.getOrUndefined(contributor)
					),
				})
			})
		)
	})
