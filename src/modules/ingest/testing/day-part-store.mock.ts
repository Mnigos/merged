import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory.storage'
import { Layer } from 'effect'
import { jsonDayPartStoreLayer } from '../infrastructure/json-day-part.store'

/** Test `DayPartStore`: the JSON day part store over a fresh in-memory storage. */
export const inMemoryDayPartStoreLayer = jsonDayPartStoreLayer.pipe(
	Layer.provide(inMemoryJsonStorageLayer())
)
