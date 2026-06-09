import { addDays, format, isValid, parse } from 'date-fns'

/**
 * The one date module (Plan 06). Daily notes are keyed by **local** calendar
 * dates as ISO `YYYY-MM-DD` strings — "today" follows the user's clock, and all
 * arithmetic round-trips through date-fns so DST transitions can't skip or
 * repeat a day. Nothing else in the app may compute dates by hand.
 */

const ISO_DATE = 'yyyy-MM-dd'

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayIso(): string {
  return format(new Date(), ISO_DATE)
}

/** Is `value` a real calendar date in ISO `YYYY-MM-DD` form? */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  return isValid(parse(value, ISO_DATE, new Date()))
}

/** The ISO date `days` after `date` (negative for before). DST-safe. */
export function addDaysIso(date: string, days: number): string {
  return format(addDays(parse(date, ISO_DATE, new Date()), days), ISO_DATE)
}

/** Human label for an ISO date, e.g. `Tuesday, June 9`. */
export function formatDayLabel(date: string): string {
  return format(parse(date, ISO_DATE, new Date()), 'EEEE, MMMM d')
}
