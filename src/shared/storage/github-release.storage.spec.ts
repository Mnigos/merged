import { describe, expect, it } from '@effect/vitest'
import {
	ConfigProvider,
	Duration,
	Effect,
	Fiber,
	Layer,
	Option,
	Schema,
} from 'effect'
import {
	HttpClient,
	HttpClientError,
	type HttpClientRequest,
	HttpClientResponse,
} from 'effect/http'
import { TestClock } from 'effect/testing'
import {
	GITHUB_API_URL,
	GITHUB_UPLOADS_URL,
	RATE_LIMIT_BUDGET,
	RELEASE_BODY,
	WRITE_RETRIES,
} from './github-release-writer.http'
import {
	githubReleaseJsonStorageLayer,
	READ_RETRIES,
	WRITE_CONCURRENCY,
} from './github-release.storage'
import { JsonStorage } from './json-storage.port'

const REPOSITORY = 'Mnigos/merged-data'
const TOKEN = 'ghp_secretToken123'
const FULL_ENV = {
	DATA_REPOSITORY: REPOSITORY,
	GITHUB_TOKEN: TOKEN,
} as const satisfies Record<string, string>
const API = `${GITHUB_API_URL}/repos/${REPOSITORY}`
const UPLOADS = `${GITHUB_UPLOADS_URL}/repos/${REPOSITORY}`
const DOWNLOADS = `https://github.com/${REPOSITORY}/releases/download`
const ASSET_HOST = 'https://release-assets.githubusercontent.com'
const path = 'seasons/2026-10/tabs/global.json'
const tag = 'season-2026-10'
const asset = 'tabs-global.json'

interface FakeRelease {
	readonly id: number
	readonly assets: Map<string, { readonly id: number; readonly text: string }>
}

interface RecordedRequest {
	readonly method: string
	readonly url: string
	readonly headers: Readonly<Record<string, string>>
	readonly body: string | undefined
}

interface ScriptedResponse {
	readonly status: number
	readonly body?: string
	readonly headers?: Readonly<Record<string, string>>
}

interface FakeGitHubOptions {
	readonly releases?: Readonly<Record<string, FakeRelease>>
	readonly env?: Readonly<Record<string, string>>
	readonly override?: (
		request: RecordedRequest,
		index: number
	) => ScriptedResponse | 'transport' | 'broken body' | undefined
	readonly uploadDelayMillis?: number
}

const json = (status: number, body: unknown): ScriptedResponse => ({
	status,
	body: JSON.stringify(body),
})

const decodeCreateRelease = Schema.decodeUnknownSync(
	Schema.Struct({ tag_name: Schema.String })
)

const decodeRename = Schema.decodeUnknownSync(
	Schema.Struct({ name: Schema.String })
)

const toBodyText = (request: HttpClientRequest.HttpClientRequest) =>
	request.body._tag === 'Uint8Array'
		? new TextDecoder().decode(request.body.body)
		: undefined

/** A stateful stand-in for github.com, the REST API and the uploads host. */
function fakeGitHub({
	releases: initial = {},
	env = FULL_ENV,
	override,
	uploadDelayMillis = 0,
}: FakeGitHubOptions = {}) {
	const releases = new Map(Object.entries(initial))
	const requests: RecordedRequest[] = []
	const inFlight = { uploads: 0, max: 0 }
	let nextId = 1000

	const releaseById = (id: number) =>
		[...releases.values()].find(release => release.id === id)
	const assetOf = (tagName = '', name = '') =>
		releases.get(tagName)?.assets.get(name)
	const takeId = () => {
		nextId += 1

		return nextId
	}

	function routeDownload({ origin, pathname }: URL) {
		if (origin === ASSET_HOST) {
			const [, tagName, name] = pathname.split('/')
			const found = assetOf(tagName, name)

			return found ? { status: 200, body: found.text } : { status: 404 }
		}
		const [, tagName, name] =
			/\/releases\/download\/([^/]+)\/([^/]+)$/u.exec(pathname) ?? []

		return assetOf(tagName, name)
			? {
					status: 302,
					headers: { location: `${ASSET_HOST}/${tagName}/${name}` },
				}
			: { status: 404, body: 'Not Found' }
	}

	function findRelease(tagName = '') {
		const release = releases.get(tagName)

		return release
			? json(200, { id: release.id })
			: json(404, { message: 'Not Found' })
	}

	function createRelease(body = '{}') {
		const { tag_name: tagName } = decodeCreateRelease(JSON.parse(body))
		const release = { id: takeId(), assets: new Map() }
		releases.set(tagName, release)

		return json(201, { id: release.id })
	}

	function listAssets(releaseId: number, searchParams: URLSearchParams) {
		const release = releaseById(releaseId)
		if (!release) return json(404, { message: 'Not Found' })
		const perPage = Number(searchParams.get('per_page'))
		const page = Number(searchParams.get('page'))

		return json(
			200,
			[...release.assets]
				.map(([name, { id }]) => ({ id, name }))
				.slice((page - 1) * perPage, page * perPage)
		)
	}

	function deleteAsset(assetId: number) {
		for (const release of releases.values())
			for (const [name, found] of release.assets)
				if (found.id === assetId) {
					release.assets.delete(name)

					return { status: 204 }
				}

		return json(404, { message: 'Not Found' })
	}

	function renameAsset(assetId: number, body = '{}') {
		const { name } = decodeRename(JSON.parse(body))
		for (const release of releases.values())
			for (const [current, found] of release.assets)
				if (found.id === assetId) {
					if (release.assets.has(name))
						return json(422, { errors: [{ code: 'already_exists' }] })
					release.assets.delete(current)
					release.assets.set(name, found)

					return json(200, { id: assetId, name })
				}

		return json(404, { message: 'Not Found' })
	}

	function uploadAsset(releaseId: number, name: string, body = '') {
		const release = releaseById(releaseId)
		if (!release) return json(404, { message: 'Not Found' })
		if (release.assets.has(name))
			return json(422, { errors: [{ code: 'already_exists' }] })
		const id = takeId()
		release.assets.set(name, { id, text: body })

		return json(201, { id, name })
	}

	function route({ method, url, body }: RecordedRequest): ScriptedResponse {
		const parsed = new URL(url)
		const { origin, pathname, searchParams } = parsed
		if (origin === 'https://github.com' || origin === ASSET_HOST)
			return routeDownload(parsed)

		const byTag = /\/releases\/tags\/([^/]+)$/u.exec(pathname)
		const assets = /\/releases\/(\d+)\/assets$/u.exec(pathname)
		const assetById = /\/releases\/assets\/(\d+)$/u.exec(pathname)
		if (method === 'GET' && byTag) return findRelease(byTag[1])
		if (method === 'POST' && `${origin}${pathname}` === `${API}/releases`)
			return createRelease(body)
		if (method === 'GET' && assets)
			return listAssets(Number(assets[1]), searchParams)
		if (method === 'DELETE' && assetById)
			return deleteAsset(Number(assetById[1]))
		if (method === 'PATCH' && assetById)
			return renameAsset(Number(assetById[1]), body)
		if (method === 'POST' && origin === GITHUB_UPLOADS_URL && assets)
			return uploadAsset(
				Number(assets[1]),
				searchParams.get('name') ?? '',
				body
			)

		return json(500, { message: `unexpected ${method} ${url}` })
	}

	const client = HttpClient.make((request, url) =>
		Effect.gen(function* () {
			const recorded: RecordedRequest = {
				method: request.method,
				url: url.href,
				headers: request.headers,
				body: toBodyText(request),
			}
			const index = requests.length
			requests.push(recorded)
			const scripted = override?.(recorded, index)
			if (scripted === 'transport')
				return yield* Effect.fail(
					new HttpClientError.HttpClientError({
						reason: new HttpClientError.TransportError({
							request,
							description: `connection reset for ${TOKEN}`,
						}),
					})
				)
			if (scripted === 'broken body')
				return HttpClientResponse.fromWeb(
					request,
					new Response(
						new ReadableStream({
							start: controller => controller.error(new Error('body reset')),
						}),
						{ status: 200 }
					)
				)
			const isUpload = url.origin === GITHUB_UPLOADS_URL
			if (isUpload && uploadDelayMillis > 0) {
				inFlight.uploads += 1
				inFlight.max = Math.max(inFlight.max, inFlight.uploads)
				yield* Effect.sleep(`${uploadDelayMillis} millis`)
				inFlight.uploads -= 1
			}
			const { status, body, headers } = scripted ?? route(recorded)

			return HttpClientResponse.fromWeb(
				request,
				new Response(status === 204 ? null : (body ?? ''), {
					status,
					headers,
				})
			)
		})
	)
	const layer = githubReleaseJsonStorageLayer.pipe(
		Layer.provide(
			Layer.mergeAll(
				Layer.succeed(HttpClient.HttpClient, client),
				ConfigProvider.layer(ConfigProvider.fromUnknown(env))
			)
		)
	)

	return { releases, requests, inFlight, layer }
}

const seasonRelease = (
	assets: Readonly<Record<string, string>> = {}
): FakeRelease => ({
	id: 7,
	assets: new Map(
		Object.entries(assets).map(([name, text], index) => [
			name,
			{ id: 100 + index, text },
		])
	),
})

const describeRequest = ({ method, url }: RecordedRequest) => `${method} ${url}`

describe('githubReleaseJsonStorageLayer reads', () => {
	it.effect.each([false, true])(
		'reads a direct 200 from the default repository, temporary fallback: %s',
		temporary => {
			const { requests, layer } = fakeGitHub({
				env: { GITHUB_TOKEN: TOKEN },
				override: (_, index) =>
					temporary && index === 0
						? { status: 404 }
						: { status: 200, body: '{"ok":"żółw"}' },
			})

			return Effect.gen(function* () {
				expect(yield* (yield* JsonStorage).readText(path)).toEqual(
					Option.some('{"ok":"żółw"}')
				)
				const url = `https://github.com/Mnigos/merged/releases/download/${tag}/${asset}`
				expect(requests.map(describeRequest)).toEqual(
					temporary ? [`GET ${url}`, `GET ${url}.tmp`] : [`GET ${url}`]
				)
				for (const request of requests)
					expect(request.headers).not.toHaveProperty('authorization')
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('follows the download redirect without a token or caches', () => {
		const { requests, layer } = fakeGitHub({
			releases: { [tag]: seasonRelease({ [asset]: '{"ok":"żółw"}' }) },
		})

		return Effect.gen(function* () {
			expect(yield* (yield* JsonStorage).readText(path)).toEqual(
				Option.some('{"ok":"żółw"}')
			)
			expect(requests.map(describeRequest)).toEqual([
				`GET ${DOWNLOADS}/${tag}/${asset}`,
				`GET ${ASSET_HOST}/${tag}/${asset}`,
			])
			expect(requests[0]?.headers).toMatchObject({
				'cache-control': 'no-cache',
			})
			for (const request of requests)
				expect(request.headers).not.toHaveProperty('authorization')
		}).pipe(Effect.provide(layer))
	})

	it.effect.each<{
		readonly missing: string
		readonly releases: Readonly<Record<string, FakeRelease>>
	}>([
		{ missing: 'release', releases: {} },
		{
			missing: 'asset',
			releases: { [tag]: seasonRelease({ 'other.json': '{}' }) },
		},
	])(
		'reads a missing $missing as none after the temporary and a second final read',
		({ releases }) => {
			const { requests, layer } = fakeGitHub({ releases })

			return Effect.gen(function* () {
				expect(yield* (yield* JsonStorage).readText(path)).toEqual(
					Option.none()
				)
				expect(requests.map(describeRequest)).toEqual([
					`GET ${DOWNLOADS}/${tag}/${asset}`,
					`GET ${DOWNLOADS}/${tag}/${asset}.tmp`,
					`GET ${DOWNLOADS}/${tag}/${asset}`,
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'finds the final asset renamed between the final and temporary reads',
		() => {
			const { requests, layer } = fakeGitHub({
				override: (_, index) =>
					index < 2 ? { status: 404 } : { status: 200, body: '"renamed"' },
			})

			return Effect.gen(function* () {
				expect(yield* (yield* JsonStorage).readText(path)).toEqual(
					Option.some('"renamed"')
				)
				expect(requests.map(describeRequest)).toEqual([
					`GET ${DOWNLOADS}/${tag}/${asset}`,
					`GET ${DOWNLOADS}/${tag}/${asset}.tmp`,
					`GET ${DOWNLOADS}/${tag}/${asset}`,
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('retries a read whose body breaks off after a 200', () => {
		const { requests, layer } = fakeGitHub({
			override: (_, index) =>
				index < READ_RETRIES ? 'broken body' : { status: 200, body: '[1]' },
		})

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild((yield* JsonStorage).readText(path))
			yield* TestClock.adjust('10 minutes')

			expect(yield* Fiber.join(fiber)).toEqual(Option.some('[1]'))
			expect(requests).toHaveLength(READ_RETRIES + 1)
			expect(new Set(requests.map(describeRequest))).toEqual(
				new Set([`GET ${DOWNLOADS}/${tag}/${asset}`])
			)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails a read whose body keeps breaking off', () => {
		const { requests, layer } = fakeGitHub({ override: () => 'broken body' })

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				Effect.flip((yield* JsonStorage).readText(path))
			)
			yield* TestClock.adjust('10 minutes')

			expect(yield* Fiber.join(fiber)).toMatchObject({
				_tag: 'StorageError',
				path,
			})
			expect(requests).toHaveLength(READ_RETRIES + 1)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'falls back to the temporary asset while an overwrite renames it',
		() => {
			const { requests, layer } = fakeGitHub({
				releases: { [tag]: seasonRelease({ [`${asset}.tmp`]: '"new"' }) },
			})

			return Effect.gen(function* () {
				expect(yield* (yield* JsonStorage).readText(path)).toEqual(
					Option.some('"new"')
				)
				expect(requests.map(describeRequest)).toEqual([
					`GET ${DOWNLOADS}/${tag}/${asset}`,
					`GET ${DOWNLOADS}/${tag}/${asset}.tmp`,
					`GET ${ASSET_HOST}/${tag}/${asset}.tmp`,
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'reads the final asset without asking for the temporary one',
		() => {
			const { requests, layer } = fakeGitHub({
				releases: {
					[tag]: seasonRelease({
						[asset]: '"final"',
						[`${asset}.tmp`]: '"stale"',
					}),
				},
			})

			return Effect.gen(function* () {
				expect(yield* (yield* JsonStorage).readText(path)).toEqual(
					Option.some('"final"')
				)
				expect(requests).toHaveLength(2)
				expect(requests.some(request => request.url.endsWith('.tmp'))).toBe(
					false
				)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('reads without GITHUB_TOKEN', () => {
		const { layer } = fakeGitHub({
			releases: { [tag]: seasonRelease({ [asset]: '[1]' }) },
			env: { DATA_REPOSITORY: REPOSITORY },
		})

		return Effect.gen(function* () {
			expect(yield* (yield* JsonStorage).readText(path)).toEqual(
				Option.some('[1]')
			)
		}).pipe(Effect.provide(layer))
	})

	it.effect('retries a 503 with backoff', () => {
		const { requests, layer } = fakeGitHub({
			override: (_, index) =>
				index === 0 ? { status: 503 } : { status: 200, body: '[1]' },
		})

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild((yield* JsonStorage).readText(path))
			yield* TestClock.adjust('799 millis')
			expect(requests).toHaveLength(1)
			yield* TestClock.adjust('1 minute')

			expect(yield* Fiber.join(fiber)).toEqual(Option.some('[1]'))
			expect(requests.map(describeRequest)).toEqual([
				`GET ${DOWNLOADS}/${tag}/${asset}`,
				`GET ${DOWNLOADS}/${tag}/${asset}`,
			])
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails after the bounded number of read retries', () => {
		const { requests, layer } = fakeGitHub({
			override: () => ({ status: 502 }),
		})

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				Effect.flip((yield* JsonStorage).readText(path))
			)
			yield* TestClock.adjust('10 minutes')

			expect(yield* Fiber.join(fiber)).toMatchObject({
				_tag: 'StorageError',
				path,
			})
			expect(requests).toHaveLength(READ_RETRIES + 1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails a 403 read without retrying', () => {
		const { requests, layer } = fakeGitHub({
			override: () => ({ status: 403 }),
		})

		return Effect.gen(function* () {
			expect(
				yield* Effect.flip((yield* JsonStorage).readText(path))
			).toMatchObject({ _tag: 'StorageError', path })
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})
})

describe('githubReleaseJsonStorageLayer writes', () => {
	it.effect(
		'uploads a new asset to an existing release and authenticates only REST requests',
		() => {
			const { releases, requests, layer } = fakeGitHub({
				releases: { [tag]: seasonRelease() },
			})
			const text = '{"ok":"żółw"}'

			return Effect.gen(function* () {
				const storage = yield* JsonStorage
				expect(yield* storage.writeText(path, text)).toEqual({
					location: `${DOWNLOADS}/${tag}/${asset}`,
					bytes: Buffer.byteLength(text),
				})
				expect(requests.map(describeRequest)).toEqual([
					`GET ${API}/releases/tags/${tag}`,
					`GET ${API}/releases/7/assets?per_page=100&page=1`,
					`POST ${UPLOADS}/releases/7/assets?name=${asset}`,
				])
				expect(requests[2]).toMatchObject({
					body: text,
					headers: { 'content-type': 'application/json' },
				})
				expect(releases.get(tag)?.assets.get(asset)?.text).toBe(text)
				expect(yield* storage.readText(path)).toEqual(Option.some(text))
				expect(requests).toHaveLength(5)
				for (const request of requests) {
					const { origin } = new URL(request.url)
					if (
						origin === 'https://api.github.com' ||
						origin === 'https://uploads.github.com'
					)
						expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`)
					else expect(request.headers).not.toHaveProperty('authorization')
				}
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('creates a missing release, uploads, and returns the URL', () => {
		const { releases, requests, layer } = fakeGitHub()
		const text = '{"ok":"żółw"}'

		return Effect.gen(function* () {
			expect(yield* (yield* JsonStorage).writeText(path, text)).toEqual({
				location: `${DOWNLOADS}/${tag}/${asset}`,
				bytes: Buffer.byteLength(text),
			})
			expect(requests.map(describeRequest)).toEqual([
				`GET ${API}/releases/tags/${tag}`,
				`POST ${API}/releases`,
				`POST ${UPLOADS}/releases/1001/assets?name=${asset}`,
			])
			expect(JSON.parse(requests[1]?.body ?? '')).toEqual({
				tag_name: tag,
				name: tag,
				body: RELEASE_BODY,
				prerelease: true,
				make_latest: 'false',
			})
			expect(requests[2]).toMatchObject({
				body: text,
				headers: { 'content-type': 'application/json' },
			})
			for (const request of requests)
				expect(request.headers).toMatchObject({
					authorization: `Bearer ${TOKEN}`,
					accept: 'application/vnd.github+json',
					'x-github-api-version': '2022-11-28',
					'user-agent': 'merged',
				})
			expect(releases.get(tag)?.assets.get(asset)?.text).toBe(text)
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'lists two full pages before overwriting the final asset through a temporary upload',
		() => {
			const existing = Object.fromEntries(
				Array.from({ length: 199 }, (_, index) => [
					`shards-${index}.json`,
					'{}',
				])
			)
			const visible: string[] = []
			const fake = fakeGitHub({
				releases: {
					[tag]: seasonRelease({ ...existing, [asset]: '"old"' }),
				},
				override: () => {
					visible.push(fake.releases.get(tag)?.assets.get(asset)?.text ?? '')

					return undefined
				},
			})
			const { releases, requests, layer } = fake

			return Effect.gen(function* () {
				yield* (yield* JsonStorage).writeText(path, '"new"')

				expect(requests.map(describeRequest)).toEqual([
					`GET ${API}/releases/tags/${tag}`,
					`GET ${API}/releases/7/assets?per_page=100&page=1`,
					`GET ${API}/releases/7/assets?per_page=100&page=2`,
					`GET ${API}/releases/7/assets?per_page=100&page=3`,
					`POST ${UPLOADS}/releases/7/assets?name=${asset}.tmp`,
					`DELETE ${API}/releases/assets/299`,
					`PATCH ${API}/releases/assets/1001`,
				])
				expect(JSON.parse(requests[6]?.body ?? '')).toEqual({ name: asset })
				expect(releases.get(tag)?.assets.get(asset)).toEqual({
					id: 1001,
					text: '"new"',
				})
				expect(releases.get(tag)?.assets.size).toBe(200)
				expect(visible).toEqual([
					...Array.from({ length: 6 }, () => '"old"'),
					'',
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('reuses the cached release and the uploaded asset id', () => {
		const { releases, requests, layer } = fakeGitHub()

		return Effect.gen(function* () {
			const storage = yield* JsonStorage
			yield* storage.writeText(path, '1')
			yield* storage.writeText('seasons/2026-10/shards/2f.json', '2')
			requests.length = 0
			yield* storage.writeText(path, '3')

			expect(requests.map(describeRequest)).toEqual([
				`POST ${UPLOADS}/releases/1001/assets?name=${asset}.tmp`,
				`DELETE ${API}/releases/assets/1002`,
				`PATCH ${API}/releases/assets/1004`,
			])
			expect(
				Object.fromEntries(
					[...(releases.get(tag)?.assets ?? [])].map(([name, found]) => [
						name,
						found.text,
					])
				)
			).toEqual({ 'shards-2f.json': '2', [asset]: '3' })
		}).pipe(Effect.provide(layer))
	})

	it.effect('replaces an asset another writer uploaded meanwhile', () => {
		const { releases, requests, layer } = fakeGitHub({
			releases: { [tag]: seasonRelease() },
		})

		return Effect.gen(function* () {
			const storage = yield* JsonStorage
			yield* storage.writeText('seasons/2026-10/repos.json', '{}')
			releases.get(tag)?.assets.set(asset, { id: 555, text: '"theirs"' })
			requests.length = 0
			yield* storage.writeText(path, '"ours"')

			expect(requests.map(describeRequest)).toEqual([
				`POST ${UPLOADS}/releases/7/assets?name=${asset}`,
				`GET ${API}/releases/7/assets?per_page=100&page=1`,
				`POST ${UPLOADS}/releases/7/assets?name=${asset}.tmp`,
				`DELETE ${API}/releases/assets/555`,
				`PATCH ${API}/releases/assets/1002`,
			])
			expect(releases.get(tag)?.assets.get(asset)?.text).toBe('"ours"')
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		'deletes a stale temporary asset before overwriting through a new one',
		() => {
			const { releases, requests, layer } = fakeGitHub({
				releases: {
					[tag]: seasonRelease({
						[asset]: '"old"',
						[`${asset}.tmp`]: '"interrupted"',
					}),
				},
			})

			return Effect.gen(function* () {
				yield* (yield* JsonStorage).writeText(path, '"new"')

				expect(requests.map(describeRequest)).toEqual([
					`GET ${API}/releases/tags/${tag}`,
					`GET ${API}/releases/7/assets?per_page=100&page=1`,
					`DELETE ${API}/releases/assets/101`,
					`POST ${UPLOADS}/releases/7/assets?name=${asset}.tmp`,
					`DELETE ${API}/releases/assets/100`,
					`PATCH ${API}/releases/assets/1001`,
				])
				expect([...(releases.get(tag)?.assets ?? [])]).toEqual([
					[asset, { id: 1001, text: '"new"' }],
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'promotes a surviving temporary asset before overwriting it',
		() => {
			const { releases, requests, layer } = fakeGitHub({
				releases: {
					[tag]: seasonRelease({ [`${asset}.tmp`]: '"interrupted"' }),
				},
			})

			return Effect.gen(function* () {
				yield* (yield* JsonStorage).writeText(path, '"new"')

				expect(requests.map(describeRequest)).toEqual([
					`GET ${API}/releases/tags/${tag}`,
					`GET ${API}/releases/7/assets?per_page=100&page=1`,
					`PATCH ${API}/releases/assets/100`,
					`POST ${UPLOADS}/releases/7/assets?name=${asset}.tmp`,
					`DELETE ${API}/releases/assets/100`,
					`PATCH ${API}/releases/assets/1001`,
				])
				expect(JSON.parse(requests[2]?.body ?? '')).toEqual({ name: asset })
				expect([...(releases.get(tag)?.assets ?? [])]).toEqual([
					[asset, { id: 1001, text: '"new"' }],
				])
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'keeps the promoted copy readable when the next upload fails',
		() => {
			const { releases, requests, layer } = fakeGitHub({
				releases: {
					[tag]: seasonRelease({ [`${asset}.tmp`]: '"interrupted"' }),
				},
				override: request =>
					new URL(request.url).origin === GITHUB_UPLOADS_URL
						? { status: 500 }
						: undefined,
			})

			return Effect.gen(function* () {
				const storage = yield* JsonStorage
				const fiber = yield* Effect.forkChild(
					Effect.flip(storage.writeText(path, '"new"'))
				)
				yield* TestClock.adjust('30 minutes')

				expect(yield* Fiber.join(fiber)).toMatchObject({
					_tag: 'StorageError',
					path,
				})
				expect(requests.some(request => request.method === 'DELETE')).toBe(
					false
				)
				expect([...(releases.get(tag)?.assets ?? [])]).toEqual([
					[asset, { id: 100, text: '"interrupted"' }],
				])
				expect(yield* storage.readText(path)).toEqual(
					Option.some('"interrupted"')
				)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('waits out a secondary rate limit lasting ten minutes', () => {
		let limitedUploads = 0
		const { releases, requests, layer } = fakeGitHub({
			releases: { [tag]: seasonRelease() },
			override: request => {
				if (new URL(request.url).origin !== GITHUB_UPLOADS_URL) return undefined
				if (limitedUploads >= 10) return undefined
				limitedUploads += 1

				return {
					status: 403,
					body: 'You have exceeded a secondary rate limit',
					headers: { 'retry-after': '60' },
				}
			},
		})
		const uploads = () =>
			requests.filter(
				request => new URL(request.url).origin === GITHUB_UPLOADS_URL
			).length

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				(yield* JsonStorage).writeText(path, '1')
			)
			yield* TestClock.adjust('9 minutes')
			expect(uploads()).toBeLessThan(11)
			yield* TestClock.adjust('5 minutes')
			yield* Fiber.join(fiber)

			expect(uploads()).toBe(11)
			expect(releases.get(tag)?.assets.get(asset)?.text).toBe('1')
		}).pipe(Effect.provide(layer))
	})

	it.effect(
		`gives up once rate limit waits would pass ${Duration.toMinutes(RATE_LIMIT_BUDGET)} minutes`,
		() => {
			const { requests, layer } = fakeGitHub({
				releases: { [tag]: seasonRelease() },
				override: request =>
					new URL(request.url).origin === GITHUB_UPLOADS_URL
						? {
								status: 429,
								body: 'slow down',
								headers: { 'retry-after': '3600' },
							}
						: undefined,
			})

			return Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(
					Effect.flip((yield* JsonStorage).writeText(path, '1'))
				)
				yield* TestClock.adjust('3 hours')

				expect(yield* Fiber.join(fiber)).toMatchObject({
					_tag: 'StorageError',
					path,
				})
				expect(
					requests.filter(
						request => new URL(request.url).origin === GITHUB_UPLOADS_URL
					)
				).toHaveLength(2)
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect(
		'looks the release up again when creating it answers already exists',
		() => {
			const fake = fakeGitHub({
				override: request => {
					if (request.method !== 'POST' || request.url !== `${API}/releases`)
						return undefined
					fake.releases.set(tag, { id: 9, assets: new Map() })

					return json(422, {
						message: 'Validation Failed',
						errors: [{ code: 'already_exists', field: 'tag_name' }],
					})
				},
			})
			const { releases, requests, layer } = fake

			return Effect.gen(function* () {
				yield* (yield* JsonStorage).writeText(path, '1')

				expect(requests.map(describeRequest)).toEqual([
					`GET ${API}/releases/tags/${tag}`,
					`POST ${API}/releases`,
					`GET ${API}/releases/tags/${tag}`,
					`GET ${API}/releases/9/assets?per_page=100&page=1`,
					`POST ${UPLOADS}/releases/9/assets?name=${asset}`,
				])
				expect(releases.get(tag)?.assets.get(asset)?.text).toBe('1')
			}).pipe(Effect.provide(layer))
		}
	)

	it.effect('creates a release once for concurrent first writes', () => {
		const { requests, layer } = fakeGitHub()

		return Effect.gen(function* () {
			const storage = yield* JsonStorage
			yield* Effect.all(
				['00', '01', '02'].map(key =>
					storage.writeText(`seasons/2026-10/shards/${key}.json`, key)
				),
				{ concurrency: 'unbounded' }
			)

			expect(
				requests.filter(request => request.url === `${API}/releases`)
			).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect(`keeps at most ${WRITE_CONCURRENCY} writes in flight`, () => {
		const { inFlight, layer } = fakeGitHub({
			releases: { [tag]: seasonRelease() },
			uploadDelayMillis: 1000,
		})

		return Effect.gen(function* () {
			const storage = yield* JsonStorage
			const fiber = yield* Effect.forkChild(
				Effect.all(
					Array.from({ length: 10 }, (_, index) =>
						storage.writeText(`seasons/2026-10/shards/${index}a.json`, '{}')
					),
					{ concurrency: 'unbounded' }
				)
			)
			yield* TestClock.adjust('1 minute')
			yield* Fiber.join(fiber)

			expect(inFlight.max).toBe(WRITE_CONCURRENCY)
		}).pipe(Effect.provide(layer))
	})

	it.effect('retries a 502 and a network error with backoff', () => {
		const { releases, requests, layer } = fakeGitHub({
			releases: { [tag]: seasonRelease() },
			override: (_, index) => {
				if (index === 1) return { status: 502 }
				if (index === 2) return 'transport'

				return undefined
			},
		})

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				(yield* JsonStorage).writeText(path, '1')
			)
			yield* TestClock.adjust('1 minute')
			yield* Fiber.join(fiber)

			expect(requests).toHaveLength(5)
			expect(releases.get(tag)?.assets.get(asset)?.text).toBe('1')
		}).pipe(Effect.provide(layer))
	})

	it.effect('waits out a secondary rate limit before retrying', () => {
		const { requests, layer } = fakeGitHub({
			releases: { [tag]: seasonRelease() },
			override: (_, index) =>
				index === 1
					? {
							status: 403,
							body: 'You have exceeded a secondary rate limit',
							headers: { 'retry-after': '30' },
						}
					: undefined,
		})

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				(yield* JsonStorage).writeText(path, '1')
			)
			yield* TestClock.adjust('29 seconds')
			expect(requests).toHaveLength(2)
			yield* TestClock.adjust('1 minute')
			yield* Fiber.join(fiber)

			expect(requests).toHaveLength(4)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails a permission 403 without retrying', () => {
		const { requests, layer } = fakeGitHub({
			override: () => json(403, { message: 'Resource not accessible' }),
		})

		return Effect.gen(function* () {
			expect(
				yield* Effect.flip((yield* JsonStorage).writeText(path, '1'))
			).toMatchObject({ _tag: 'StorageError', path })
			expect(requests).toHaveLength(1)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails after the bounded number of write retries', () => {
		const { requests, layer } = fakeGitHub({
			override: () => ({ status: 500 }),
		})

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				Effect.flip((yield* JsonStorage).writeText(path, '1'))
			)
			yield* TestClock.adjust('30 minutes')

			expect(yield* Fiber.join(fiber)).toMatchObject({
				_tag: 'StorageError',
				path,
			})
			expect(requests).toHaveLength(WRITE_RETRIES + 1)
		}).pipe(Effect.provide(layer))
	})

	it.effect.each([
		{
			failure: 'a rejected token',
			override: () => json(401, { message: `Bad token ${TOKEN}` }),
		},
		{ failure: 'a network error', override: () => 'transport' as const },
	])('keeps the token out of $failure', ({ override }) => {
		const { layer } = fakeGitHub({ override })

		return Effect.gen(function* () {
			const fiber = yield* Effect.forkChild(
				Effect.flip((yield* JsonStorage).writeText(path, '1'))
			)
			yield* TestClock.adjust('30 minutes')
			const error = yield* Fiber.join(fiber)

			expect(error).toMatchObject({ _tag: 'StorageError', path })
			expect(error.message).not.toContain(TOKEN)
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails a write without GITHUB_TOKEN before any request', () => {
		const { requests, layer } = fakeGitHub({
			env: { DATA_REPOSITORY: REPOSITORY },
		})

		return Effect.gen(function* () {
			const error = yield* Effect.flip(
				(yield* JsonStorage).writeText(path, '1')
			)

			expect(error).toMatchObject({ _tag: 'StorageError', path })
			expect(error.message).toContain('GITHUB_TOKEN')
			expect(requests).toHaveLength(0)
		}).pipe(Effect.provide(layer))
	})
})

describe('githubReleaseJsonStorageLayer construction and paths', () => {
	it.effect('reads from this repository when DATA_REPOSITORY is unset', () => {
		const { requests, layer } = fakeGitHub({ env: {} })

		return Effect.gen(function* () {
			expect(yield* (yield* JsonStorage).readText(path)).toEqual(Option.none())
			expect(requests.map(describeRequest)).toEqual([
				`GET https://github.com/Mnigos/merged/releases/download/${tag}/${asset}`,
				`GET https://github.com/Mnigos/merged/releases/download/${tag}/${asset}.tmp`,
				`GET https://github.com/Mnigos/merged/releases/download/${tag}/${asset}`,
			])
		}).pipe(Effect.provide(layer))
	})

	it.effect('fails layer construction when DATA_REPOSITORY is invalid', () => {
		const { requests, layer } = fakeGitHub({
			env: { DATA_REPOSITORY: 'merged-data', GITHUB_TOKEN: TOKEN },
		})

		return Effect.gen(function* () {
			const error = yield* Effect.flip(JsonStorage.pipe(Effect.provide(layer)))

			expect(error).toMatchObject({ _tag: 'ConfigError' })
			expect(error.message).toContain('DATA_REPOSITORY')
			expect(requests).toHaveLength(0)
		})
	})

	it.effect.each([
		'/etc/passwd',
		'../outside.json',
		'days//x.json',
		'other/file.json',
		'seasons/current/repos.json',
	])('rejects the path %j before any request', invalidPath => {
		const { requests, layer } = fakeGitHub()

		return Effect.gen(function* () {
			const storage = yield* JsonStorage

			expect(
				yield* Effect.flip(storage.writeText(invalidPath, '{}'))
			).toMatchObject({ _tag: 'StorageError', path: invalidPath })
			expect(yield* Effect.flip(storage.readText(invalidPath))).toMatchObject({
				_tag: 'StorageError',
				path: invalidPath,
			})
			expect(requests).toHaveLength(0)
		}).pipe(Effect.provide(layer))
	})
})
