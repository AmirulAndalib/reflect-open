import { addDays, format, isValid, parse } from 'date-fns'

/**
 * The one date module (Plan 06). Daily notes are keyed by **local** calendar
 * dates as ISO `YYYY-MM-DD` strings — "today" follows the user's clock, and all
 * arithmetic round-trips through date-fns so DST transitions can't skip or
 * repeat a day. Nothing else in the app may compute dates by hand.
 */

const ISO_DATE_FORMAT = 'yyyy-MM-dd'

/** Parse an ISO `YYYY-MM-DD` string as a local Date (the one parsing path). */
export function parseIsoDate(date: string): Date {
  return parse(date, ISO_DATE_FORMAT, new Date())
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayIso(): string {
  return format(new Date(), ISO_DATE_FORMAT)
}

/** Is `value` a real calendar date in ISO `YYYY-MM-DD` form? */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  return isValid(parseIsoDate(value))
}

/** The ISO date `days` after `date` (negative for before). DST-safe. */
export function addDaysIso(date: string, days: number): string {
  return format(addDays(parseIsoDate(date), days), ISO_DATE_FORMAT)
}

/** Human label for an ISO date, e.g. `Tuesday, June 9`. */
export function formatDayLabel(date: string): string {
  return format(parseIsoDate(date), 'EEEE, MMMM d')
}
