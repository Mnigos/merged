---
name: web-app-patterns
description: TanStack Start routes, loaders, server functions, and React component patterns for merged. Use when creating or modifying src/routes, module presentation components, hooks, server functions, or anything that moves data from Blob to the page.
---

Use this skill for app work: TanStack Start file routes, loaders, server functions, React component composition, and local hooks.

## First Read

Before editing, read:

- This skill and the module rules in `ARCHITECTURE.md`.
- At least 3 similar existing route, component, hook, or server function files when they exist.
- Any imported component, hook, router API, or server function whose API you are not already certain about.

Use those files as the source of truth. Prefer live repo patterns over examples in this skill.

## Working Rules

- Routes live under `src/routes/` (file-based); UI lives in `src/modules/<module>/presentation/components/`. Reusable domain-free primitives live in `src/shared/ui/`.
- Keep route files thin: params, `validateSearch`, `loader`, `head`, and page composition from presentation components.
- Server functions live in `presentation/<name>.functions.ts`, built with `createServerFn({ method: 'GET' })`, validated with `.validator(Schema.toStandardSchemaV1(inputSchema))`, and run application services through the app runtime in `src/runtime/`. Handlers return plain serializable data.
- Server-only code uses the `.server.ts` suffix; TanStack Start import protection keeps it out of the client bundle.
- Components and hooks never import `effect`. They receive plain data as props or from `Route.useLoaderData()`.
- Load route data in the `loader` by calling server functions; pages render on the server, so the ranking is readable without JavaScript.
- Define search params in `validateSearch` with a Schema before reading or writing them; components consume typed search state and never parse URL values.
- Use URL state for shareable state: board, season, looked-up login. Use React state for ephemeral UI only.
- Never use direct `useEffect`; follow the `no-use-effect` skill.
- There is no TanStack Query yet. Add it only when client-side fetching or caching is genuinely needed; then pass all options inside `queryOptions()` and use `useQuery` (not `useSuspenseQuery`) with explicit loading, error, empty, and success states.
- Render explicit states the product needs: season in progress, final season, contributor not found, excluded contributor, empty board.
- Components use named props interfaces immediately above the component and `Readonly<ComponentNameProps>`. Arrow components are allowed.
- Do not create barrel files; import concrete files.
- Avoid manual memoization for derived state.

```tsx
export const Route = createFileRoute('/u/$login')({
	loader: ({ params }) => getContributorResult({ data: params }),
	component: ContributorPage,
})

function ContributorPage() {
	const result = Route.useLoaderData()

	return <ContributorResultCard result={result} />
}
```

## Common Decisions

- Keep pages as composition layers; module components own their markup and copy.
- Server functions cache through response headers or the loader's `staleTime`; Blob data changes once a day.
- OG images and the badge endpoint are server routes owned by `share/presentation/`.
- For visual work, also use `impeccable` and `ui-components`.

## Verification

- Run `bun run typecheck`.
- Run `bun run check:fix`.
- Run `bun run build` when routes, server functions, or config change.
- For visible UI changes, capture desktop and mobile screenshots and follow [UI screenshots](../pull-request/SKILL.md#ui-screenshots) before reporting completion.
