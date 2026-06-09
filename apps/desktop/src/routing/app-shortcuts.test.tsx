import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { listRegisteredBindings } from '@/editor/keymap'
import { useAppShortcuts } from './app-shortcuts'
import { RouterProvider, useRouter } from './router'

function shortcutsHook() {
  return renderHook(
    () => {
      useAppShortcuts()
      return useRouter()
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RouterProvider>{children}</RouterProvider>
      ),
    },
  )
}

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, cancelable: true }))
}

describe('app shortcuts', () => {
  it('registers in the central keymap registry under the app scope', () => {
    const bindings = listRegisteredBindings()
    for (const key of ['Mod-d', 'Mod-n', 'Mod-[', 'Mod-]']) {
      expect(bindings.get(key)).toBe('app')
    }
  })

  it('⌘N opens a fresh note route; ⌘D returns to today; ⌘[ ⌘] traverse', () => {
    const { result } = shortcutsHook()

    act(() => press('n'))
    expect(result.current.route.kind).toBe('note')
    const notePathOpened = (result.current.route as { kind: 'note'; path: string }).path
    expect(notePathOpened).toMatch(/^notes\/[0-9a-z]+\.md$/)

    act(() => press('d'))
    expect(result.current.route).toEqual({ kind: 'today' })

    act(() => press('['))
    expect(result.current.route.kind).toBe('note')

    act(() => press(']'))
    expect(result.current.route).toEqual({ kind: 'today' })
  })

  it('matches uppercase keys (caps lock) and ignores auto-repeat', () => {
    const { result } = shortcutsHook()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', metaKey: true }))
    })
    expect(result.current.route.kind).toBe('note') // caps lock still triggers

    const opened = result.current.route
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'n', metaKey: true, repeat: true }),
      )
    })
    expect(result.current.route).toEqual(opened) // held key doesn't spam notes
  })

  it('ignores chords with extra modifiers', () => {
    const { result } = shortcutsHook()
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', metaKey: true, shiftKey: true }),
    )
    expect(result.current.route).toEqual({ kind: 'today' })
  })
})
