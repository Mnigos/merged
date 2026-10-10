import { useSyncExternalStore } from 'react'

/** How often coarse time labels refresh. */
const TICK_MS = 60_000

const listeners = new Set<() => void>()
let clientNow: number | undefined
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
	clientNow = Date.now()
	for (const listener of listeners) listener()
}

/** One interval shared by every subscriber, running only while someone listens. */
function subscribe(listener: () => void) {
	listeners.add(listener)
	if (listeners.size === 1) {
		clientNow = Date.now()
		timer = setInterval(tick, TICK_MS)
	}

	return () => {
		listeners.delete(listener)
		if (listeners.size > 0) return
		clearInterval(timer)
		timer = undefined
	}
}

/**
 * The current time for coarse labels such as "updated 3 minutes ago",
 * without an effect. Server render and hydration use `renderedAt`, the time
 * the loader ran on the server, so both produce the same label; once
 * subscribed the client clock takes over and ticks every minute.
 */
export const useNow = (renderedAt: number) =>
	useSyncExternalStore(
		subscribe,
		() => clientNow ?? renderedAt,
		() => renderedAt
	)
