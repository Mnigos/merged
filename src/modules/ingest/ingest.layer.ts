import { Layer } from 'effect'
import { IngestDay } from './application/ingest-day.service'
import { ghArchiveHttpSourceLayer } from './infrastructure/gh-archive-http-source'
import { localFileDayStoreLayer } from './infrastructure/local-file-day-store'

export interface IngestLayerOptions {
	readonly outDirectory: string
}

/** Ingest wired to GH Archive over HTTP and daily aggregates on local disk. */
export const ingestLayer = ({ outDirectory }: IngestLayerOptions) =>
	IngestDay.layer.pipe(
		Layer.provide(
			Layer.mergeAll(
				ghArchiveHttpSourceLayer,
				localFileDayStoreLayer(outDirectory)
			)
		)
	)
