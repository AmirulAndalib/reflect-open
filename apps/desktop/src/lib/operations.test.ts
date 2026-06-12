import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { resetOperations, startOperation, useOperations } from './operations'

beforeEach(() => {
  vi.useFakeTimers()
  resetOperations()
})
afterEach(() => {
  vi.useRealTimers()
  resetOperations()
})

describe('operations store', () => {
  it('tracks start → progress → done through the hook', () => {
    const { result } = renderHook(() => useOperations())
    expect(result.current).toEqual([])

    let handle!: ReturnType<typeof startOperation>
    act(() => {
      handle = startOperation('Renaming "A" → "B"')
    })
    expect(result.current).toHaveLength(1)
    expect(result.current[0].label).toBe('Renaming "A" → "B"')
    expect(result.current[0].progress).toBeNull()

    act(() => handle.progress(3, 12))
    expect(result.current[0].progress).toEqual({ done: 3, total: 12 })

    act(() => handle.done())
    // Once shown, the entry stays for the minimum visible window — a fast
    // operation must not flash for a single frame.
    expect(result.current).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1200))
    expect(result.current).toEqual([])
  })

  it('a failed operation lingers with its error, then clears', () => {
    const { result } = renderHook(() => useOperations())
    let handle!: ReturnType<typeof startOperation>
    act(() => {
      handle = startOperation('Renaming "A" → "B"')
    })
    act(() => handle.fail('disk full'))
    expect(result.current[0].status).toBe('failed')
    expect(result.current[0].message).toBe('disk full')

    act(() => vi.advanceTimersByTime(8000 + 1200))
    expect(result.current).toEqual([])
  })

  it('a notice completes with a lingering message, then clears', () => {
    // Partial work where the label promised a count: not a failure, not
    // silence — the message stays visible the way a failure would.
    const { result } = renderHook(() => useOperations())
    let handle!: ReturnType<typeof startOperation>
    act(() => {
      handle = startOperation('Renaming 3 notes')
    })
    act(() => handle.notice('renamed 2 of 3'))
    expect(result.current[0].status).toBe('notice')
    expect(result.current[0].message).toBe('renamed 2 of 3')

    act(() => vi.advanceTimersByTime(8000 + 1200))
    expect(result.current).toEqual([])
  })

  it('handles are scoped: finishing one operation leaves others running', () => {
    const { result } = renderHook(() => useOperations())
    let first!: ReturnType<typeof startOperation>
    act(() => {
      first = startOperation('first')
      startOperation('second')
    })
    act(() => first.done())
    act(() => vi.advanceTimersByTime(1200))
    expect(result.current.map((operation) => operation.label)).toEqual(['second'])
  })
})
