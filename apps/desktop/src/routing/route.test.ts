import { describe, expect, it } from 'vitest'
import { routeForPath } from './route'

describe('routeForPath', () => {
  it('routes real daily paths to the daily view', () => {
    expect(routeForPath('daily/2026-06-09.md')).toEqual({ kind: 'daily', date: '2026-06-09' })
  })

  it('routes regular notes to the note view', () => {
    expect(routeForPath('notes/charlotte.md')).toEqual({ kind: 'note', path: 'notes/charlotte.md' })
  })

  it('routes a daily file with an impossible calendar date as a plain note', () => {
    // dailyPath() would throw on 2026-02-31 — navigation must not crash.
    expect(routeForPath('daily/2026-02-31.md')).toEqual({
      kind: 'note',
      path: 'daily/2026-02-31.md',
    })
  })
})
