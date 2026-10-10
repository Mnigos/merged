import { Config } from 'effect'

/** GitHub token for GraphQL enrichment, read from `GITHUB_TOKEN` and kept redacted. */
export const githubTokenConfig = Config.Redacted('GITHUB_TOKEN')
