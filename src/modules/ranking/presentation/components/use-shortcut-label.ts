import { useSyncExternalStore } from 'react'

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/iu

const subscribe = () => () => undefined

function getClientLabel() {
	return APPLE_PLATFORM.test(navigator.platform) ? '⌘K' : 'Ctrl K'
}

const getServerLabel = () => '⌘K'

/**
 * Label of the lookup shortcut for this platform: `⌘K` on Apple devices,
 * `Ctrl K` elsewhere. The server renders `⌘K`; the client corrects it after
 * hydration without a mismatch.
 */
export const useShortcutLabel = () =>
	useSyncExternalStore(subscribe, getClientLabel, getServerLabel)
