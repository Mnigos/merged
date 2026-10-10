import { Button, buttonClassName } from '@shared/ui/button'
import { CheckIcon, LinkIcon, XLogoIcon } from '@shared/ui/icons'
import { useState } from 'react'
import {
	toShareText,
	toXIntentUrl,
	type ShareTextInput,
} from '../../domain/share-text'

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABEL = {
	idle: 'Copy link',
	copied: 'Copied',
	failed: 'Copy failed',
} as const satisfies Record<CopyState, string>

/** How long the copy confirmation stays before the label resets. */
const COPY_CONFIRMATION_MS = 2000

interface ShareActionsProps {
	readonly result: ShareTextInput
	/** Absolute URL of the result page. */
	readonly url: string
}

/** One gesture from a result to a post on X, or a link on the clipboard. */
export const ShareActions = ({ result, url }: Readonly<ShareActionsProps>) => {
	const [copyState, setCopyState] = useState<CopyState>('idle')

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url)
			setCopyState('copied')
		} catch {
			setCopyState('failed')
		}
		setTimeout(() => setCopyState('idle'), COPY_CONFIRMATION_MS)
	}

	return (
		<>
			<a
				className={buttonClassName()}
				href={toXIntentUrl({ text: toShareText(result), url })}
				rel="noopener noreferrer"
				target="_blank"
			>
				<XLogoIcon />
				Share on X
			</a>
			<Button onClick={() => void copyLink()} variant="ghost">
				{copyState === 'copied' ? <CheckIcon /> : <LinkIcon />}
				<span aria-live="polite">{COPY_LABEL[copyState]}</span>
			</Button>
		</>
	)
}
