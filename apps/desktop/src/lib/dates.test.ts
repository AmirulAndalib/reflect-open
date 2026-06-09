import { describe, expect, it } from 'vitest'
import { addDaysIso, formatDayLabel, isIsoDate, todayIso } from './dates'

describe('dates', () => {
  it('todayIso returns a valid local ISO date', () => {
    const today = todayIso()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(isIsoDate(today)).toBe(true)
  })

  it('isIsoDate rejects malformed and impossible dates', () => {
    expect(isIsoDate('2026-06-09')).toBe(true)
    expect(isIsoDate('2026-6-9')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-02-31')).toBe(false)
    expect(isIsoDate('not a date')).toBe(false)
  })

  it('addDaysIso crosses month and year boundaries', () => {
    expect(addDaysIso('2026-06-09', 1)).toBe('2026-06-10')
    expect(addDaysIso('2026-06-09', -1)).toBe('2026-06-08')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('formatDayLabel renders a readable day', () => {
    expect(formatDayLabel('2026-06-09')).toBe('Tuesday, June 9')
  })
})
