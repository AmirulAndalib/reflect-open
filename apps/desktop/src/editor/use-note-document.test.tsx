import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import type { NoteEditorHandle } from './note-editor'
import { useNoteDocument } from './use-note-document'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => true }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_, handler: (event: { payload: unknown }) => void) => {
    emitChange = (payload) => handler({ payload })
    return Promise.resolve(() => {
      emitChange = null
    })
  }),
}))

let emitChange: ((payload: unknown) => void) | null = null
const mockInvoke = vi.mocked(invoke)

/** The fake on-disk file + a write log, behind the mocked IPC. */
let disk: string
let writes: string[]

function fakeEditor(): NoteEditorHandle & { applied: string[] } {
  const applied: string[] = []
  return {
    applied,
    setMarkdown: (markdown) => {
      applied.push(markdown)
    },
    getMarkdown: () => '',
    focus: () => {},
  }
}

beforeEach(() => {
  disk = '# Hello\n'
  writes = []
  emitChange = null
  mockInvoke.mockReset()
  mockInvoke.mockImplementation(async (command, args) => {
    if (command === 'note_read') {
      return disk
    }
    if (command === 'note_write') {
      const contents = (args as { contents: string }).contents
      disk = contents
      writes.push(contents)
      return null
    }
    return null
  })
})

async function readyHook() {
  const hook = renderHook(() => useNoteDocument('notes/a.md'))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

describe('useNoteDocument', () => {
  it('loads the note and seeds the editor content', async () => {
    const { result } = await readyHook()
    expect(result.current.initialContent).toBe('# Hello\n')
    expect(result.current.dirty).toBe(false)
  })

  it('debounces edits into an atomic write and clears dirty', async () => {
    vi.useFakeTimers()
    try {
      const hook = renderHook(() => useNoteDocument('notes/a.md'))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(hook.result.current.status).toBe('ready')

      act(() => hook.result.current.onEditorChange('# Hello edited\n'))
      expect(hook.result.current.dirty).toBe(true)
      expect(writes).toEqual([])

      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(writes).toEqual(['# Hello edited\n'])
      expect(hook.result.current.dirty).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores the watcher echo of its own save', async () => {
    const { result } = await readyHook()
    const editor = fakeEditor()
    act(() => result.current.bindEditor(editor))

    // The watcher reports our own write back; content matches disk state.
    act(() => emitChange?.([{ path: 'notes/a.md', kind: 'upsert' }]))
    await act(async () => {})
    expect(editor.applied).toEqual([])
    expect(result.current.conflict).toBeNull()
  })

  it('reloads a clean buffer on a real external change', async () => {
    const { result } = await readyHook()
    const editor = fakeEditor()
    act(() => result.current.bindEditor(editor))

    disk = '# Changed outside\n'
    act(() => emitChange?.([{ path: 'notes/a.md', kind: 'upsert' }]))
    await waitFor(() => expect(editor.applied).toEqual(['# Changed outside\n']))
    expect(result.current.conflict).toBeNull()
    expect(result.current.dirty).toBe(false)
  })

  it('parks an external change as a conflict when the buffer is dirty', async () => {
    const { result } = await readyHook()
    const editor = fakeEditor()
    act(() => result.current.bindEditor(editor))

    act(() => result.current.onEditorChange('# My unsaved edit\n'))
    disk = '# Theirs\n'
    act(() => emitChange?.([{ path: 'notes/a.md', kind: 'upsert' }]))
    await waitFor(() => expect(result.current.conflict).toBe('# Theirs\n'))
    expect(editor.applied).toEqual([]) // never clobbered

    // Load theirs: applies the external content and clears the conflict.
    act(() => result.current.loadTheirs())
    expect(editor.applied).toEqual(['# Theirs\n'])
    expect(result.current.conflict).toBeNull()
    expect(result.current.dirty).toBe(false)
  })

  it('keepMine rewrites the file with the buffer', async () => {
    const { result } = await readyHook()
    act(() => result.current.onEditorChange('# My unsaved edit\n'))
    disk = '# Theirs\n'
    act(() => emitChange?.([{ path: 'notes/a.md', kind: 'upsert' }]))
    await waitFor(() => expect(result.current.conflict).toBe('# Theirs\n'))

    act(() => result.current.keepMine())
    await waitFor(() => expect(writes).toContain('# My unsaved edit\n'))
    expect(result.current.conflict).toBeNull()
  })
})
