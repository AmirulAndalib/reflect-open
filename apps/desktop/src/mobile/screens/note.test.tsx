import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { untitledNotePath } from '@reflect/core'
import { clearNoteFocus, peekNoteFocus, requestNoteFocus } from '@/editor/note-focus-request'
import { RouterProvider } from '@/routing/router'
import { MobileNote } from './note'

const paneProps = vi.hoisted(() => ({ autoFocus: null as boolean | null }))

vi.mock('@/components/note-pane', () => ({
  NotePane: ({ autoFocus }: { autoFocus?: boolean }) => {
    paneProps.autoFocus = autoFocus ?? false
    return <div data-testid="fake-pane" />
  },
}))

vi.mock('@/mobile/note-actions-menu', () => ({
  NoteActionsMenu: () => null,
}))

function renderNote(path: string): ReturnType<typeof render> {
  return render(
    <RouterProvider initialRoute={{ kind: 'note', path }}>
      <MobileNote path={path} />
    </RouterProvider>,
  )
}

afterEach(() => {
  cleanup()
  paneProps.autoFocus = null
  clearNoteFocus('notes/target.md')
})

describe('MobileNote focus contract', () => {
  it('does not autofocus a plain arrival (no keyboard on browse)', () => {
    renderNote('notes/target.md')
    expect(paneProps.autoFocus).toBe(false)
  })

  it('autofocuses a fresh untitled note (the + flow)', () => {
    renderNote(untitledNotePath())
    expect(paneProps.autoFocus).toBe(true)
  })

  it('consumes a wiki-link focus request and restores focus on arrival', () => {
    requestNoteFocus('notes/target.md')
    renderNote('notes/target.md')
    expect(paneProps.autoFocus).toBe(true)
    // Consumed: a later plain revisit must not raise the keyboard again.
    expect(peekNoteFocus('notes/target.md')).toBe(false)
  })

  it('ignores a focus request aimed at a different note', () => {
    requestNoteFocus('notes/target.md')
    renderNote('notes/other.md')
    expect(paneProps.autoFocus).toBe(false)
  })
})
