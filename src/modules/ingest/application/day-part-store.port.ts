import type { IsoDate } from '@shared/schema/iso-date.schema'
import { Context, type Effect, type Option } from 'effect'
import type { DailyAggregate } from '../domain/daily-aggregate.model'
import type { DayStoreError } from './day-store.error'
import type { StoredDay } from './day-store.port'

/**
 * Day parts: daily aggregates of a subset of a day's hours, ingested on
 * separate runners and merged into the day file. `label` names the hours,
 * such as `0-5`.
 */
export interface DayPartStoreShape {
	readonly write: (
		aggregate: DailyAggregate,
		label: string
	) => Effect.Effect<StoredDay, DayStoreError>
	readonly read: (
		date: IsoDate,
		label: string
	) => Effect.Effect<Option.Option<DailyAggregate>, DayStoreError>
}

export class DayPartStore extends Context.Service<
	DayPartStore,
	DayPartStoreShape
>()('ingest/DayPartStore') {}
