import { dataRepositoryConfig } from '@shared/config/data-repository'
import { githubTokenConfig } from '@shared/config/github-token'
import {
	ConfigProvider,
	Effect,
	Layer,
	Option,
	Redacted,
	Schedule,
	Semaphore,
} from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/http'
import { type ReleaseAsset, toReleaseAsset } from './github-release-asset'
import {
	makeGitHubReleaseWriter,
	TEMPORARY_SUFFIX,
} from './github-release-writer'
import { GitHubReleaseError } from './github-release.error'
import { JsonStorage } from './json-storage.port'
import { StorageError } from './storage.error'

/** Retries of a read that failed with a 5xx, 408, 429 or a network error. */
export const READ_RETRIES = 3

/** Writes in flight at once, to stay under GitHub's secondary rate limits. */
export const WRITE_CONCURRENCY = 4

/** Read statuses retried with backoff. */
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([
	408, 429, 500, 502, 503, 504,
])

/** Redirects a read follows from `github.com` to the asset's storage URL. */
const MAX_REDIRECTS = 5

/** Public URL of a release asset; GitHub resolves the name on every request. */
export const toDownloadUrl = (
	repository: string,
	{ tag, asset }: ReleaseAsset
) => `https://github.com/${repository}/releases/download/${tag}/${asset}`

const toReleaseAssetEffect = (path: string) =>
	Effect.fromResult(toReleaseAsset(path))

/**
 * `JsonStorage` on GitHub Release assets of `DATA_REPOSITORY` (`owner/name`,
 * this repository `Mnigos/merged` by default).
 * Each path maps to a release tag and an asset name (see `toReleaseAsset`).
 *
 * Reads fetch `https://github.com/<repository>/releases/download/<tag>/<asset>`
 * without a token and with `cache-control: no-cache`, following the redirect
 * to the asset storage. GitHub resolves the asset by name on every request, so
 * an overwrite is visible at once. A 404 is followed by one read of
 * `<asset>.tmp` and, if that is missing too, one more read of `<asset>`, so a
 * read during the rename that ends an overwrite falls back to the temporary
 * asset or finds the renamed one; only then is the file missing (at most three
 * requests). Each request, body included, is retried `READ_RETRIES` times
 * with backoff on 5xx, 408, 429 and network errors.
 *
 * Writes go through `makeGitHubReleaseWriter` with `GITHUB_TOKEN`, read at
 * the first write so a read-only website needs no token; at
 * most `WRITE_CONCURRENCY` writes run at once, and writes to the same path
 * must not overlap. Error messages never carry the token. Needs an
 * `HttpClient`.
 */
export const githubReleaseJsonStorageLayer = Layer.effect(
	JsonStorage,
	Effect.gen(function* () {
		const configProvider = yield* ConfigProvider.ConfigProvider
		const repository = yield* dataRepositoryConfig
		const client = yield* HttpClient.HttpClient
		const readClient = client.pipe(HttpClient.followRedirects(MAX_REDIRECTS))
		const writes = yield* Semaphore.make(WRITE_CONCURRENCY)

		const fetchOnce = Effect.fn('GitHubReleaseJsonStorage.fetchOnce')(
			function* (releaseAsset: ReleaseAsset) {
				const response = yield* readClient
					.execute(
						HttpClientRequest.get(toDownloadUrl(repository, releaseAsset)).pipe(
							HttpClientRequest.setHeader('cache-control', 'no-cache')
						)
					)
					.pipe(
						Effect.mapError(
							error =>
								new GitHubReleaseError({
									message: error.message,
									retryable: error.reason._tag === 'TransportError',
								})
						)
					)
				if (response.status === 404) return Option.none<string>()
				if (response.status < 200 || response.status >= 300)
					return yield* Effect.fail(
						new GitHubReleaseError({
							message: `GitHub responded ${response.status}`,
							status: response.status,
							retryable: TRANSIENT_STATUSES.has(response.status),
						})
					)

				return Option.some(
					yield* response.text.pipe(
						Effect.mapError(
							error =>
								new GitHubReleaseError({
									message: error.message,
									retryable: true,
								})
						)
					)
				)
			}
		)

		const fetchAsset = (releaseAsset: ReleaseAsset) =>
			fetchOnce(releaseAsset).pipe(
				Effect.retry({
					schedule: Schedule.exponential('1 second').pipe(Schedule.jittered),
					times: READ_RETRIES,
					while: error => error.retryable,
				})
			)

		const readText = Effect.fn('GitHubReleaseJsonStorage.readText')(function* (
			path: string
		) {
			const releaseAsset = yield* toReleaseAssetEffect(path)
			const temporary = {
				...releaseAsset,
				asset: `${releaseAsset.asset}${TEMPORARY_SUFFIX}`,
			}

			return yield* fetchAsset(releaseAsset).pipe(
				Effect.flatMap(text =>
					Option.isSome(text) ? Effect.succeed(text) : fetchAsset(temporary)
				),
				Effect.flatMap(text =>
					Option.isSome(text) ? Effect.succeed(text) : fetchAsset(releaseAsset)
				),
				Effect.mapError(
					error =>
						new StorageError({ path, message: `${path}: ${error.message}` })
				)
			)
		})

		const writer = yield* Effect.cached(
			githubTokenConfig.parse(configProvider).pipe(
				Effect.mapError(
					() =>
						new GitHubReleaseError({
							message: 'GITHUB_TOKEN is not set; GitHub Release writes need it',
							retryable: false,
						})
				),
				Effect.flatMap(token =>
					makeGitHubReleaseWriter({
						client,
						repository,
						secret: Redacted.value(token),
					})
				)
			)
		)

		const writeText = Effect.fn('GitHubReleaseJsonStorage.writeText')(
			function* (path: string, text: string) {
				const releaseAsset = yield* toReleaseAssetEffect(path)
				yield* writer.pipe(
					Effect.flatMap(replaceAsset =>
						writes.withPermits(1)(replaceAsset(releaseAsset, text))
					),
					Effect.mapError(
						error =>
							new StorageError({ path, message: `${path}: ${error.message}` })
					)
				)

				return {
					location: toDownloadUrl(repository, releaseAsset),
					bytes: Buffer.byteLength(text),
				}
			}
		)

		return { readText, writeText }
	})
)
