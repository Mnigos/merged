import { Layer } from 'effect'
import { Enrich } from './application/enrich.service'
import { SeasonProfiles } from './application/season-profiles.service'
import { githubProfileSourceLayer } from './infrastructure/github-profile-source'
import { jsonProfileStoreLayer } from './infrastructure/json-profile-store'

/**
 * `SeasonProfiles` over whatever `JsonStorage` the composition root provides,
 * for modules that read enrichment.
 */
export const seasonProfilesLayer = SeasonProfiles.layer.pipe(
	Layer.provide(jsonProfileStoreLayer)
)

/**
 * Profiles wired to GitHub and the JSON profile store: `Enrich` and
 * `SeasonProfiles`. Needs `JsonStorage` and `GitHubGraphql` from the
 * composition root.
 */
export const profilesLayer = Layer.mergeAll(
	Enrich.layer.pipe(Layer.provide(githubProfileSourceLayer)),
	SeasonProfiles.layer
).pipe(Layer.provide(jsonProfileStoreLayer))
