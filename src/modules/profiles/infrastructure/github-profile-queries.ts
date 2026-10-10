import type { GraphqlBatchSpec } from '@shared/github/graphql-batch'
import type { GitHubLogin } from '@shared/schema/github-login'
import { Schema } from 'effect'
import type { PullRequestTarget } from '../domain/enrichment-targets'

/** Fields enrichment reads from a repository. */
export const REPOSITORY_FIELDS =
	'nameWithOwner stargazerCount primaryLanguage { name }'

/** Fields enrichment reads from a user. */
export const USER_FIELDS = 'login name location company avatarUrl'

/** Fields enrichment reads from a merged pull request. */
export const PULL_REQUEST_FIELDS = 'merged mergedBy { login }'

/** Splits `owner/name` at the first slash. */
function toOwnerAndName(repository: string) {
	const slash = repository.indexOf('/')

	return {
		owner: repository.slice(0, slash),
		name: repository.slice(slash + 1),
	}
}

export const repositoryBatchSpec = {
	variables: { owner: 'String!', name: 'String!' },
	toVariables: toOwnerAndName,
	toField: ({ owner, name }) =>
		`repository(owner: ${owner}, name: ${name}) { ${REPOSITORY_FIELDS} }`,
} as const satisfies GraphqlBatchSpec<string>

export const userBatchSpec = {
	variables: { login: 'String!' },
	toVariables: login => ({ login }),
	toField: ({ login }) => `user(login: ${login}) { ${USER_FIELDS} }`,
} as const satisfies GraphqlBatchSpec<GitHubLogin>

export const pullRequestBatchSpec = {
	variables: { owner: 'String!', name: 'String!', number: 'Int!' },
	toVariables: ({ repository, number }) => ({
		...toOwnerAndName(repository),
		number,
	}),
	toField: ({ owner, name, number }) =>
		`repository(owner: ${owner}, name: ${name}) { pullRequest(number: ${number}) { ${PULL_REQUEST_FIELDS} } }`,
} as const satisfies GraphqlBatchSpec<PullRequestTarget>

export const repositoryNodeSchema = Schema.Struct({
	nameWithOwner: Schema.String,
	stargazerCount: Schema.Int,
	primaryLanguage: Schema.NullOr(Schema.Struct({ name: Schema.String })),
})

export const userNodeSchema = Schema.Struct({
	login: Schema.String,
	name: Schema.NullOr(Schema.String),
	location: Schema.NullOr(Schema.String),
	company: Schema.NullOr(Schema.String),
	avatarUrl: Schema.NullOr(Schema.String),
})

export const pullRequestNodeSchema = Schema.Struct({
	pullRequest: Schema.NullOr(
		Schema.Struct({
			merged: Schema.Boolean,
			mergedBy: Schema.NullOr(Schema.Struct({ login: Schema.String })),
		})
	),
})
