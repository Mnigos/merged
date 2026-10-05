import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
	component: HomePage,
})

function HomePage() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-2 px-5">
			<h1 className="text-2xl font-semibold tracking-tight">merged</h1>
			<p className="font-mono text-sm text-fg-2">scaffold ready</p>
		</main>
	)
}
