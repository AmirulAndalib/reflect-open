import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { RouterProvider, useRouter } from './router'

function routerHook() {
  return renderHook(() => useRouter(), {
    wrapper: ({ children }: { children: ReactNode }) => <RouterProvider>{children}</RouterProvider>,
  })
}

describe('router', () => {
  it('starts on today with no history', () => {
    const { result } = routerHook()
    expect(result.current.route).toEqual({ kind: 'today' })
    expect(result.current.canBack).toBe(false)
    expect(result.current.canForward).toBe(false)
  })

  it('navigate pushes; back and forward traverse the stack', () => {
    const { result } = routerHook()
    act(() => result.current.navigate({ kind: 'daily', date: '2026-06-08' }))
    act(() => result.current.navigate({ kind: 'note', path: 'notes/a.md' }))
    expect(result.current.route).toEqual({ kind: 'note', path: 'notes/a.md' })

    act(() => result.current.back())
    expect(result.current.route).toEqual({ kind: 'daily', date: '2026-06-08' })
    expect(result.current.canForward).toBe(true)

    act(() => result.current.forward())
    expect(result.current.route).toEqual({ kind: 'note', path: 'notes/a.md' })
    expect(result.current.canForward).toBe(false)
  })

  it('navigating from a back position truncates the forward branch', () => {
    const { result } = routerHook()
    act(() => result.current.navigate({ kind: 'daily', date: '2026-06-08' }))
    act(() => result.current.navigate({ kind: 'daily', date: '2026-06-07' }))
    act(() => result.current.back())
    act(() => result.current.navigate({ kind: 'search', query: 'x' }))
    expect(result.current.canForward).toBe(false)
    act(() => result.current.back())
    expect(result.current.route).toEqual({ kind: 'daily', date: '2026-06-08' })
  })

  it('re-navigating to the current route is a no-op (no stack growth)', () => {
    const { result } = routerHook()
    act(() => result.current.navigate({ kind: 'daily', date: '2026-06-08' }))
    act(() => result.current.navigate({ kind: 'daily', date: '2026-06-08' }))
    act(() => result.current.back())
    expect(result.current.route).toEqual({ kind: 'today' })
    expect(result.current.canBack).toBe(false)
  })

  it('back/forward at the edges are no-ops', () => {
    const { result } = routerHook()
    act(() => result.current.back())
    expect(result.current.route).toEqual({ kind: 'today' })
    act(() => result.current.forward())
    expect(result.current.route).toEqual({ kind: 'today' })
  })
})
