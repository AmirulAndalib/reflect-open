import { differenceInCalendarDays } from 'date-fns'
import { addDaysIso, parseIsoDate } from './dates'

/**
 * The daily stream's virtual window (Plan 06b): a **fixed** chronological range
 * of days around an anchor (today at mount), indexed `0 … count-1` from oldest
 * to newest. Virtual rows are free until mounted, so a generous static window
 * (~5 years back, 1 year forward) sidesteps bidirectional infinite scroll's
 * prepend/scroll-compensation problem entirely. Index↔date is pure offset math.
 */

export const PAST_DAYS = 5 * 365
export const FUTURE_DAYS = 365

export interface DayWindow {
  /** ISO date of index 0 (the oldest day in the window). */
  start: string
  /** Total number of days (virtual rows). */
  count: number
  /** Index of the anchor day (today at creation). */
  anchorIndex: number
}

/** Build the window around `anchor` (today). Stable for the life of the view. */
export function createDayWindow(anchor: string): DayWindow {
  return {
    start: addDaysIso(anchor, -PAST_DAYS),
    count: PAST_DAYS + FUTURE_DAYS + 1,
    anchorIndex: PAST_DAYS,
  }
}

/** The ISO date at `index` (0 = oldest). */
export function dateAtIndex(window: DayWindow, index: number): string {
  return addDaysIso(window.start, index)
}

/**
 * The index of `date` within the window, clamped to its bounds — a date link
 * outside the window still scrolls to the nearest edge instead of erroring.
 */
export function indexOfDate(window: DayWindow, date: string): number {
  const offset = differenceInCalendarDays(parseIsoDate(date), parseIsoDate(window.start))
  return Math.max(0, Math.min(window.count - 1, offset))
}
