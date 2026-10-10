import {
	SeasonProfiles,
	type SeasonProfilesFiles,
} from '@modules/profiles/application/season-profiles.service'
import { isBot } from '@shared/github/bots'
import { githubLoginSchema } from '@shared/schema/github-login'
import type { SeasonId } from '@shared/schema/season-id'
import { Effect, Layer, Option } from 'effect'
import { EnrichmentSourceError } from '../application/enrichment-source.error'
import { EnrichmentSource } from '../application/enrichment-source.port'
import {
	emptyEnrichment,
	toPullRequestKey,
	type SeasonEnrichment,
} from '../domain/enrichment'

const toLogin = (login: string) => githubLoginSchema.make(login.toLowerCase())

const valuesOf = <TFile, TValue>(
	file: Option.Option<TFile>,
	pick: (file: TFile) => Readonly<Record<string, TValue>>
) =>
	Option.match(file, {
		onNone: () => [],
		onSome: some => Object.values(pick(some)),
	})

/**
 * Maps the profiles files to ranking's enrichment, keys and logins lowercase
 * like the season's: repositories GitHub found,
 * contributor profiles (bots stay the shared `isBot` heuristic, GraphQL cannot
 * see app accounts), and pull requests with a known merger.
 */
export function toSeasonEnrichment({
	repositories,
	contributors,
	mergers,
}: SeasonProfilesFiles): SeasonEnrichment {
	if (
		Option.isNone(repositories) &&
		Option.isNone(contributors) &&
		Option.isNone(mergers)
	)
		return emptyEnrichment

	return {
		repositories: new Map(
			valuesOf(repositories, file => file.repositories)
				.filter(profile => !profile.missing)
				.map(profile => [
					profile.repository.toLowerCase(),
					{ stars: profile.stars, language: profile.language },
				])
		),
		contributors: new Map(
			valuesOf(contributors, file => file.contributors)
				.filter(profile => !profile.missing)
				.map(profile => [
					toLogin(profile.login),
					{
						name: profile.name,
						location: profile.location,
						isBot: isBot(profile.login),
					},
				])
		),
		mergers: new Map(
			valuesOf(mergers, file => file.pullRequests).flatMap(resolution =>
				resolution.mergedBy === null
					? []
					: [
							[
								toPullRequestKey(
									resolution.repository.toLowerCase(),
									resolution.number
								),
								toLogin(resolution.mergedBy),
							] as const,
						]
			)
		),
	}
}

/** `EnrichmentSource` over profiles' `SeasonProfiles`; empty until `enrich` ran for the season. */
export const profilesEnrichmentSourceLayer = Layer.effect(
	EnrichmentSource,
	Effect.gen(function* () {
		const seasonProfiles = yield* SeasonProfiles

		const read = Effect.fn('ProfilesEnrichmentSource.read')(function* (
			seasonId: SeasonId
		) {
			const files = yield* seasonProfiles.read(seasonId).pipe(
				Effect.mapError(
					error =>
						new EnrichmentSourceError({
							season: seasonId,
							message: error.message,
						})
				)
			)

			return toSeasonEnrichment(files)
		})

		return { read }
	})
)
