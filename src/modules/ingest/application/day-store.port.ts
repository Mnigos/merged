import type { IsoDate } from '@shared/schema/iso-date'
import { Context, type Effect, type Option } from 'effect'
import type { DailyAggregate } from '../domain/daily-aggregate'
import type { DayStoreError } from './day-store.error'

/** Where a daily aggregate was written and its encoded size. */
export interface StoredDay {
	readonly location: string
	readonly bytes: number
}

export interface DayStoreShape {
	readonly write: (
		aggregate: DailyAggregate
	) => Effect.Effect<StoredDay, DayStoreError>
	readonly read: (
		date: IsoDate
	) => Effect.Effect<Option.Option<DailyAggregate>, DayStoreError>
}

export class DayStore extends Context.Service<DayStore, DayStoreShape>()(
	'ingest/DayStore'
) {}
