import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Route } from '@/routing/route'
import { tabRootFor, useTabDoubleTap } from './use-tab-double-tap'

const TODAY: Route = { kind: 'today' }
const ALL: Route = { kind: 'allNotes', tag: null }
const NOTE: Route = { kind: 'note', path: 'notes/a.md' }

function mountTaps(initial: Route = TODAY) {
  return renderHook((route: Route) => useTabDoubleTap(route), { initialProps: initial })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Pin Date.now so tap spacing is exact (the gesture-test convention). */
function atTimes(...times: number[]): void {
  const clock = vi.spyOn(Date, 'now')
  for (const time of times) {
    clock.mockImplementationOnce(() => time)
  }
}

describe('useTabDoubleTap', () => {
  it('pairs two taps on the same tab within the window', () => {
    const hook = mountTaps()
    atTimes(1000, 1400)
    act(() => {
      expect(hook.result.current('daily')).toBe(false)
    })
    act(() => {
      expect(hook.result.current('daily')).toBe(true)
    })
  })

  it('does not pair taps spaced past the window', () => {
    const hook = mountTaps()
    atTimes(1000, 1500)
    act(() => {
      expect(hook.result.current('daily')).toBe(false)
    })
    act(() => {
      expect(hook.result.current('daily')).toBe(false)
    })
  })

  it('a tap on another tab starts a fresh pairing', () => {
    const hook = mountTaps()
    atTimes(1000, 1100, 1200)
    act(() => {
      expect(hook.result.current('daily')).toBe(false)
    })
    act(() => {
      expect(hook.result.current('all')).toBe(false)
    })
    act(() => {
      expect(hook.result.current('all')).toBe(true)
    })
  })

  it('survives the navigation the first tap itself causes', () => {
    // Tap All from Daily: the tap's own navigate lands on the All root
    // before the second tap — the pending tap must still pair.
    const hook = mountTaps(TODAY)
    atTimes(1000, 1100)
    act(() => {
      expect(hook.result.current('all')).toBe(false)
    })
    hook.rerender(ALL)
    act(() => {
      expect(hook.result.current('all')).toBe(true)
    })
  })

  it('expires a pending tap when the route leaves its tab root', () => {
    // A navigation between the taps (a deep link, an opened note) means the
    // second tap is a return, not a capture gesture.
    const hook = mountTaps(TODAY)
    atTimes(1000, 1100)
    act(() => {
      expect(hook.result.current('daily')).toBe(false)
    })
    hook.rerender(NOTE)
    hook.rerender(TODAY)
    act(() => {
      expect(hook.result.current('daily')).toBe(false)
    })
  })
})

describe('tabRootFor', () => {
  it('maps tab roots and leaves stacked screens tabless', () => {
    expect(tabRootFor({ kind: 'today' })).toBe('daily')
    expect(tabRootFor({ kind: 'daily', date: '2026-07-07' })).toBe('daily')
    expect(tabRootFor({ kind: 'allNotes', tag: null })).toBe('all')
    expect(tabRootFor({ kind: 'search', query: 'x' })).toBe('all')
    expect(tabRootFor({ kind: 'tasks' })).toBe('tasks')
    expect(tabRootFor({ kind: 'chat' })).toBe('chat')
    expect(tabRootFor({ kind: 'note', path: 'notes/a.md' })).toBeNull()
    expect(tabRootFor({ kind: 'settings' })).toBeNull()
  })
})
