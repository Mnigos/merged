import { inMemoryJsonStorageLayer } from '@shared/storage/in-memory-json-storage'
import { Layer } from 'effect'
import { jsonDayStoreLayer } from '../infrastructure/json-day-store'

/** Test `DayStore`: the JSON day store over a fresh in-memory storage. */
export const inMemoryDayStoreLayer = jsonDayStoreLayer.pipe(
	Layer.provide(inMemoryJsonStorageLayer())
)
