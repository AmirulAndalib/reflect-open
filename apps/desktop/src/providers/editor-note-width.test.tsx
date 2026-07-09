import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorNoteWidthEffect } from './editor-note-width'

const settingsRef = vi.hoisted(() => ({
  current: { editorFullWidthNotes: false },
}))

vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: settingsRef.current }),
}))

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-editor-note-width')
  settingsRef.current = { editorFullWidthNotes: false }
})

describe('EditorNoteWidthEffect', () => {
  it('mirrors the note width setting onto the document root', () => {
    const view = render(<EditorNoteWidthEffect />)
    expect(document.documentElement.getAttribute('data-editor-note-width')).toBe('fixed')

    settingsRef.current = { editorFullWidthNotes: true }
    view.rerender(<EditorNoteWidthEffect />)

    expect(document.documentElement.getAttribute('data-editor-note-width')).toBe('full')
  })
})
