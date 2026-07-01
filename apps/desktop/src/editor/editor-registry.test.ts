import { afterEach, describe, expect, it } from 'vitest'
import {
  clearNoteEditors,
  getNoteEditor,
  registerNoteEditor,
  unregisterNoteEditor,
} from './editor-registry'
import type { NoteEditorHandle } from './note-editor'

function fakeHandle(): NoteEditorHandle {
  return {
    getMarkdown: () => '',
    setMarkdown: () => {},
    insertMarkdown: () => {},
    focus: () => {},
    setSelection: () => {},
  }
}

afterEach(() => {
  clearNoteEditors()
})

describe('editor registry', () => {
  it('returns the registered handle for a path, null otherwise', () => {
    const handle = fakeHandle()
    registerNoteEditor('notes/a.md', handle)
    expect(getNoteEditor('notes/a.md')).toBe(handle)
    expect(getNoteEditor('notes/b.md')).toBeNull()
  })

  it('unregisters only when the handle still owns the path', () => {
    const first = fakeHandle()
    const second = fakeHandle()
    registerNoteEditor('notes/a.md', first)
    registerNoteEditor('notes/a.md', second)
    // A stale unregister (the first pane unmounting late) must not evict the
    // pane that registered after it.
    unregisterNoteEditor('notes/a.md', first)
    expect(getNoteEditor('notes/a.md')).toBe(second)
    unregisterNoteEditor('notes/a.md', second)
    expect(getNoteEditor('notes/a.md')).toBeNull()
  })
})
