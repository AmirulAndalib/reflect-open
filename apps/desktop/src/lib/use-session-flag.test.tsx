import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionFlag } from './use-session-flag'

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('useSessionFlag', () => {
  it('falls back to the default until set, then persists for the session', () => {
    const first = renderHook(() => useSessionFlag('reflect.test-flag', true))
    expect(first.result.current[0]).toBe(true)

    act(() => first.result.current[1](false))
    expect(first.result.current[0]).toBe(false)
    first.unmount()

    const second = renderHook(() => useSessionFlag('reflect.test-flag', true))
    expect(second.result.current[0]).toBe(false)
    second.unmount()
  })

  it('updates every mounted subscriber of the same key', () => {
    const view = renderHook(() => ({
      one: useSessionFlag('reflect.test-flag', true),
      other: useSessionFlag('reflect.test-flag', true),
      unrelated: useSessionFlag('reflect.other-flag', true),
    }))

    act(() => view.result.current.one[1](false))
    expect(view.result.current.one[0]).toBe(false)
    expect(view.result.current.other[0]).toBe(false)
    expect(view.result.current.unrelated[0]).toBe(true)
    view.unmount()
  })
})
