import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { leaderboardLayer } from '@modules/ranking/ranking.layer'
import {
	dataDirectoryConfig,
	dataSourceConfig,
} from '@shared/config/data-source'
import { cachedJsonStorageLayer } from '@shared/storage/cached-json-storage'
import { localFileJsonStorageLayer } from '@shared/storage/local-file-json-storage'
import { vercelBlobJsonStorageLayer } from '@shared/storage/vercel-blob-json-storage'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { FetchHttpClient } from 'effect/http'

/**
 * Read-only storage for the website: Vercel Blob by URL or files under
 * `DATA_DIR`, chosen by `DATA_SOURCE`, behind a 60 s read cache so a page
 * view does not refetch files that change once a day.
 */
const sourceStorageLayer = Layer.unwrap(
	Effect.gen(function* () {
		if ((yield* dataSourceConfig) === 'blob')
			return vercelBlobJsonStorageLayer.pipe(
				Layer.provide(FetchHttpClient.layer)
			)

		return localFileJsonStorageLayer(yield* dataDirectoryConfig).pipe(
			Layer.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer))
		)
	})
)

const appLayer = leaderboardLayer.pipe(
	Layer.provide(cachedJsonStorageLayer()),
	Layer.provide(sourceStorageLayer)
)

/** Services every server function can use. */
export type AppServices = Layer.Success<typeof appLayer>

/** The app's runtime, built once per server process on first use. */
export const appRuntime = ManagedRuntime.make(appLayer)

/** Runs an effect on the app runtime and resolves with its value. */
export const runServer = async <TValue, TError>(
	effect: Effect.Effect<TValue, TError, AppServices>
) => await appRuntime.runPromise(effect)
