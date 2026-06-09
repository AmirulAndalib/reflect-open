import { describe, expect, it } from 'vitest'
import { createDayWindow, dateAtIndex, indexOfDate, FUTURE_DAYS, PAST_DAYS } from './day-window'

describe('day window', () => {
  const window = createDayWindow('2026-06-09')

  it('anchors the window around the given day', () => {
    expect(window.count).toBe(PAST_DAYS + FUTURE_DAYS + 1)
    expect(dateAtIndex(window, window.anchorIndex)).toBe('2026-06-09')
    expect(dateAtIndex(window, 0)).toBe(window.start)
  })

  it('index↔date round-trips across the window', () => {
    for (const date of ['2026-06-09', '2026-06-10', '2026-01-01', '2027-06-01']) {
      expect(dateAtIndex(window, indexOfDate(window, date))).toBe(date)
    }
  })

  it('orders chronologically: past below the anchor index, future above', () => {
    expect(indexOfDate(window, '2026-06-08')).toBe(window.anchorIndex - 1)
    expect(indexOfDate(window, '2026-06-10')).toBe(window.anchorIndex + 1)
  })

  it('clamps out-of-window dates to the edges instead of erroring', () => {
    expect(indexOfDate(window, '1990-01-01')).toBe(0)
    expect(indexOfDate(window, '2099-01-01')).toBe(window.count - 1)
  })
})
