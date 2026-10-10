import type { SeasonId } from '@shared/schema/season-id'
import { JsonStorage } from '@shared/storage/json-storage.port'
import { Effect, Layer, Option, Schema } from 'effect'
import { ProfileStoreError } from '../application/profile-store.error'
import { ProfileStore } from '../application/profile-store.port'
import { contributorsFileSchema } from '../domain/files/contributors-file'
import { mergersFileSchema } from '../domain/files/mergers-file'
import { repositoriesFileSchema } from '../domain/files/repositories-file'

/** Storage path of the season's repository profiles. */
export const toRepositoriesPath = (seasonId: SeasonId) =>
	`seasons/${seasonId}/repos.json`

/** Storage path of the season's contributor profiles. */
export const toContributorsPath = (seasonId: SeasonId) =>
	`seasons/${seasonId}/profiles.json`

/** Storage path of the season's merge resolutions. */
export const toMergersPath = (seasonId: SeasonId) =>
	`seasons/${seasonId}/mergers.json`

const toError = (path: string) => (cause: { readonly message: string }) =>
	new ProfileStoreError({ path, message: `${path}: ${cause.message}` })

/** `ProfileStore` on `JsonStorage`; every file is decoded with its Schema on read. */
export const jsonProfileStoreLayer = Layer.effect(
	ProfileStore,
	Effect.gen(function* () {
		const storage = yield* JsonStorage

		const jsonFile = <TValue, TEncoded>(
			schema: Schema.Codec<TValue, TEncoded>
		) => {
			const jsonSchema = Schema.fromJsonString(schema)
			const encode = Schema.encodeEffect(jsonSchema)
			const decode = Schema.decodeUnknownEffect(jsonSchema)

			return {
				read: (path: string) =>
					storage.readText(path).pipe(
						Effect.flatMap(text =>
							Option.isNone(text)
								? Effect.succeed(Option.none<TValue>())
								: decode(text.value).pipe(Effect.map(Option.some))
						),
						Effect.mapError(toError(path))
					),
				write: (path: string, value: TValue) =>
					encode(value).pipe(
						Effect.flatMap(text => storage.writeText(path, text)),
						Effect.mapError(toError(path))
					),
			}
		}

		const repositories = jsonFile(repositoriesFileSchema)
		const contributors = jsonFile(contributorsFileSchema)
		const mergers = jsonFile(mergersFileSchema)

		return {
			readRepositories: seasonId =>
				repositories.read(toRepositoriesPath(seasonId)),
			writeRepositories: file =>
				repositories.write(toRepositoriesPath(file.season), file),
			readContributors: seasonId =>
				contributors.read(toContributorsPath(seasonId)),
			writeContributors: file =>
				contributors.write(toContributorsPath(file.season), file),
			readMergers: seasonId => mergers.read(toMergersPath(seasonId)),
			writeMergers: file => mergers.write(toMergersPath(file.season), file),
		}
	})
)
