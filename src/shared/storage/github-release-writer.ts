import { toRejectionWaitMs } from '@shared/github/rate-limit-wait'
import { redactSecrets } from '@shared/github/redact-secrets'
import {
	Clock,
	Duration,
	Effect,
	Option,
	Schedule,
	Schema,
	Semaphore,
} from 'effect'
import {
	type HttpClient,
	HttpClientRequest,
	type HttpClientResponse,
} from 'effect/http'
import type { ReleaseAsset } from './github-release-asset'
import { GitHubReleaseError } from './github-release.error'

/** GitHub REST API base URL. */
export const GITHUB_API_URL = 'https://api.github.com'

/** GitHub release asset upload base URL. */
export const GITHUB_UPLOADS_URL = 'https://uploads.github.com'

/** Retries of a write request that failed with a 5xx, 408 or a network error. */
export const WRITE_RETRIES = 5

/** Longest total time one request waits out GitHub rate limits before it fails. */
export const RATE_LIMIT_BUDGET = Duration.minutes(90)

/** Assets fetched per page when listing a release's assets, GitHub's maximum. */
const ASSETS_PER_PAGE = 100

/** Suffix of the temporary asset an overwrite uploads before the rename. */
export const TEMPORARY_SUFFIX = '.tmp'

/** Body of a release the writer creates. */
export const RELEASE_BODY =
	'Data files written by the merged pipeline; do not edit by hand.'

const decodeId = Schema.decodeUnknownEffect(
	Schema.Struct({ id: Schema.Number })
)
const decodeAssets = Schema.decodeUnknownEffect(
	Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String }))
)

interface ReleaseState {
	readonly id: number
	readonly assets: Map<string, number>
}

const readBody = (response: HttpClientResponse.HttpClientResponse) =>
	response.text.pipe(Effect.orElseSucceed(() => ''))

const isRetryableStatus = (status: number) => status === 408 || status >= 500

export interface GitHubReleaseWriterOptions {
	readonly client: HttpClient.HttpClient
	readonly repository: string
	readonly secret: string
}

/**
 * Replaces release assets of `repository` through the GitHub REST API with
 * the token `secret`: finds the release by tag or creates it as a prerelease
 * that never becomes latest, and uploads the text as `application/json`. A
 * new asset is uploaded under its name. An existing one is replaced with the
 * shortest possible gap: the text is uploaded as `<asset>.tmp`, the old asset
 * deleted, and the temporary one renamed (GitHub cannot rename onto an
 * existing name), and a read during the rename falls back to the temporary
 * asset. Recovery from an interrupted run: a `<asset>.tmp` without its
 * canonical asset (stopped between delete and rename) is promoted by renaming
 * it first, so the only surviving copy is never deleted; a `<asset>.tmp` next
 * to its canonical asset is stale and deleted. A release creation answered
 * with 422 (it exists, e.g. a retried POST) is looked up again. Release ids and asset lists are cached per tag for the
 * writer's lifetime; release lookups run one at a time so a tag is created
 * once. A request rejected with 422 (an asset appeared meanwhile) refreshes
 * the asset list and writes once more.  Requests are retried
 * `WRITE_RETRIES` times with backoff on 5xx, 408 and network errors. Rate
 * limits (429, or a 403 with rate-limit headers or a secondary-limit message)
 * are waited out separately: `retry-after`, `x-ratelimit-reset`, or a minute,
 * logged as a warning per wait, up to `RATE_LIMIT_BUDGET` in total per
 * request; a permission 403 is never retried. Error messages never carry the token.
 */
export const makeGitHubReleaseWriter = Effect.fn('GitHubReleaseWriter.make')(
	function* ({ client, repository, secret }: GitHubReleaseWriterOptions) {
		const releaseLock = yield* Semaphore.make(1)
		const releases = new Map<string, ReleaseState>()
		const repositoryUrl = `${GITHUB_API_URL}/repos/${repository}`

		const toStatusError = (
			status: number,
			body: string,
			retryable: boolean,
			rateLimitWaitMs?: number
		) =>
			new GitHubReleaseError({
				message: `GitHub responded ${status}: ${redactSecrets(body.slice(0, 200), secret)}`,
				status,
				retryable,
				rateLimitWaitMs,
			})

		const sendOnce = Effect.fn('GitHubReleaseWriter.send')(function* (
			request: HttpClientRequest.HttpClientRequest
		) {
			const response = yield* client
				.execute(
					request.pipe(
						HttpClientRequest.bearerToken(secret),
						HttpClientRequest.setHeaders({
							accept: 'application/vnd.github+json',
							'x-github-api-version': '2022-11-28',
							'user-agent': 'merged',
						})
					)
				)
				.pipe(
					Effect.mapError(
						error =>
							new GitHubReleaseError({
								message: `GitHub request failed: ${redactSecrets(error.message, secret)}`,
								retryable: error.reason._tag === 'TransportError',
							})
					)
				)
			if (response.status < 300 || response.status === 404) return response

			const body = yield* readBody(response)
			if (response.status === 403 || response.status === 429) {
				const waitMs = toRejectionWaitMs(
					response,
					body,
					yield* Clock.currentTimeMillis
				)
				if (waitMs === undefined)
					return yield* Effect.fail(toStatusError(response.status, body, false))

				return yield* Effect.fail(
					toStatusError(response.status, body, false, waitMs)
				)
			}

			return yield* Effect.fail(
				toStatusError(response.status, body, isRetryableStatus(response.status))
			)
		})

		const sendWithRetries = (request: HttpClientRequest.HttpClientRequest) =>
			sendOnce(request).pipe(
				Effect.retry({
					schedule: Schedule.exponential('1 second').pipe(Schedule.jittered),
					times: WRITE_RETRIES,
					while: error => error.retryable,
				})
			)

		const sendUntil = (
			request: HttpClientRequest.HttpClientRequest,
			deadlineMs: number
		): Effect.Effect<
			HttpClientResponse.HttpClientResponse,
			GitHubReleaseError
		> =>
			sendWithRetries(request).pipe(
				Effect.catchIf(
					error => error.rateLimitWaitMs !== undefined,
					error =>
						Effect.gen(function* () {
							const waitMs = error.rateLimitWaitMs ?? 0
							if ((yield* Clock.currentTimeMillis) + waitMs > deadlineMs)
								return yield* Effect.fail(error)
							yield* Effect.logWarning(
								'GitHub rate limit reached, waiting'
							).pipe(
								Effect.annotateLogs({
									status: error.status,
									seconds: Math.ceil(waitMs / 1000),
								})
							)
							yield* Effect.sleep(Duration.millis(waitMs))

							return yield* sendUntil(request, deadlineMs)
						})
				)
			)

		const send = (request: HttpClientRequest.HttpClientRequest) =>
			Clock.currentTimeMillis.pipe(
				Effect.flatMap(nowMs =>
					sendUntil(request, nowMs + Duration.toMillis(RATE_LIMIT_BUDGET))
				)
			)

		const decode =
			<TValue, TError extends Error>(
				decodeBody: (body: unknown) => Effect.Effect<TValue, TError>
			) =>
			(response: HttpClientResponse.HttpClientResponse) =>
				response.json.pipe(
					Effect.flatMap(decodeBody),
					Effect.mapError(
						error =>
							new GitHubReleaseError({
								message: `GitHub returned an unreadable body: ${redactSecrets(error.message, secret)}`,
								status: response.status,
								retryable: false,
							})
					)
				)

		const failOn404 = (what: string) =>
			Effect.flatMap((response: HttpClientResponse.HttpClientResponse) =>
				response.status === 404
					? Effect.fail(toStatusError(404, `${what} not found`, false))
					: Effect.succeed(response)
			)

		const listAssets = Effect.fn('GitHubReleaseWriter.listAssets')(function* (
			releaseId: number
		) {
			const assets = new Map<string, number>()
			for (let page = 1; ; page += 1) {
				const pageAssets = yield* send(
					HttpClientRequest.get(
						`${repositoryUrl}/releases/${releaseId}/assets`
					).pipe(
						HttpClientRequest.setUrlParam('per_page', String(ASSETS_PER_PAGE)),
						HttpClientRequest.setUrlParam('page', String(page))
					)
				).pipe(
					failOn404(`release ${releaseId}`),
					Effect.flatMap(decode(decodeAssets))
				)
				for (const { id, name } of pageAssets) assets.set(name, id)
				if (pageAssets.length < ASSETS_PER_PAGE) return assets
			}
		})

		const findRelease = Effect.fn('GitHubReleaseWriter.findRelease')(function* (
			tag: string
		) {
			const found = yield* send(
				HttpClientRequest.get(`${repositoryUrl}/releases/tags/${tag}`)
			)
			if (found.status === 404) return Option.none<ReleaseState>()
			const { id } = yield* decode(decodeId)(found)

			return Option.some({ id, assets: yield* listAssets(id) })
		})

		const findOrCreateRelease = Effect.fn(
			'GitHubReleaseWriter.findOrCreateRelease'
		)(function* (tag: string) {
			const found = yield* findRelease(tag)
			if (Option.isSome(found)) return found.value

			const created = yield* send(
				HttpClientRequest.post(`${repositoryUrl}/releases`).pipe(
					HttpClientRequest.bodyJsonUnsafe({
						tag_name: tag,
						name: tag,
						body: RELEASE_BODY,
						prerelease: true,
						make_latest: 'false',
					})
				)
			).pipe(
				failOn404(repository),
				Effect.flatMap(decode(decodeId)),
				Effect.map(({ id }) => ({ id, assets: new Map<string, number>() })),
				Effect.catchIf(
					error => error.status === 422,
					error =>
						findRelease(tag).pipe(
							Effect.flatMap(
								Option.match({
									onNone: () => Effect.fail(error),
									onSome: Effect.succeed,
								})
							)
						)
				)
			)

			return created
		})

		const ensureRelease = (tag: string) =>
			releaseLock.withPermits(1)(
				Effect.gen(function* () {
					const cached = releases.get(tag)
					if (cached) return cached

					const release = yield* findOrCreateRelease(tag)
					releases.set(tag, release)

					return release
				})
			)

		const deleteAsset = (release: ReleaseState, asset: string) =>
			Effect.gen(function* () {
				const assetId = release.assets.get(asset)
				if (assetId === undefined) return

				yield* send(
					HttpClientRequest.delete(
						`${repositoryUrl}/releases/assets/${assetId}`
					)
				)
				release.assets.delete(asset)
			})

		const upload = (release: ReleaseState, asset: string, text: string) =>
			send(
				HttpClientRequest.post(
					`${GITHUB_UPLOADS_URL}/repos/${repository}/releases/${release.id}/assets`
				).pipe(
					HttpClientRequest.setUrlParam('name', asset),
					HttpClientRequest.bodyText(text, 'application/json')
				)
			).pipe(
				failOn404(`release ${release.id}`),
				Effect.flatMap(decode(decodeId)),
				Effect.tap(({ id }) => Effect.sync(() => release.assets.set(asset, id)))
			)

		const rename = (
			release: ReleaseState,
			assetId: number,
			from: string,
			to: string
		) =>
			send(
				HttpClientRequest.patch(
					`${repositoryUrl}/releases/assets/${assetId}`
				).pipe(HttpClientRequest.bodyJsonUnsafe({ name: to }))
			).pipe(
				failOn404(`asset ${assetId}`),
				Effect.tap(() =>
					Effect.sync(() => {
						release.assets.delete(from)
						release.assets.set(to, assetId)
					})
				)
			)

		const writeAsset = (release: ReleaseState, asset: string, text: string) =>
			Effect.gen(function* () {
				const temporary = `${asset}${TEMPORARY_SUFFIX}`
				const survivingId = release.assets.get(temporary)
				if (!release.assets.has(asset) && survivingId !== undefined)
					yield* rename(release, survivingId, temporary, asset)
				yield* deleteAsset(release, temporary)
				if (!release.assets.has(asset)) {
					yield* upload(release, asset, text)

					return
				}

				const { id } = yield* upload(release, temporary, text)
				yield* deleteAsset(release, asset)
				yield* rename(release, id, temporary, asset)
			})

		return Effect.fn('GitHubReleaseWriter.replaceAsset')(function* (
			{ tag, asset }: ReleaseAsset,
			text: string
		) {
			const release = yield* ensureRelease(tag)
			yield* writeAsset(release, asset, text).pipe(
				Effect.catchIf(
					error => error.status === 422,
					() =>
						Effect.gen(function* () {
							const assets = yield* listAssets(release.id)
							release.assets.clear()
							for (const [name, id] of assets) release.assets.set(name, id)
							yield* writeAsset(release, asset, text)
						})
				)
			)
		})
	}
)
