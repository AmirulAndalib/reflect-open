import { useEffect, type Ref } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorHandle } from '@meowdown/react'
import { NoteEditor, type NoteEditorHandle } from './note-editor'

/**
 * The `insertMarkdown` bridge (until meowdown's handle grows the API): parse
 * with the editor's builders, then replace the selection with an edge-open
 * slice. meowdown's `markdownToDoc` runs for real; the ProseMirror
 * transaction is a recording fake — the assertion is on what the bridge
 * builds and dispatches, not on ProseMirror itself.
 */

interface RecordedInsert {
  /** The slice handed to `tr.replaceSelection`. */
  slice: { openStart: number; openEnd: number; content: { childCount: number } } | null
  dispatched: number
  scrolled: number
}

const recorded = vi.hoisted((): RecordedInsert => ({ slice: null, dispatched: 0, scrolled: 0 }))

vi.mock('@meowdown/react', () => ({
  MeowdownEditor: ({ handleRef }: { handleRef?: Ref<Partial<EditorHandle>> }) => {
    const transaction = {
      replaceSelection(slice: RecordedInsert['slice']) {
        recorded.slice = slice
        return transaction
      },
      scrollIntoView() {
        recorded.scrolled += 1
        return transaction
      },
    }
    const fakeEditor = {
      // `nodes: undefined` makes markdownToDoc fall back to the shared
      // schema's builders — the same document shape a real editor produces.
      nodes: undefined,
      state: { tr: transaction },
      view: {
        dispatch: () => {
          recorded.dispatched += 1
        },
      },
    }
    useEffect(() => {
      if (typeof handleRef === 'function') {
        handleRef({ editor: fakeEditor as unknown as EditorHandle['editor'] })
      } else if (handleRef !== null && handleRef !== undefined) {
        handleRef.current = { editor: fakeEditor as unknown as EditorHandle['editor'] }
      }
    })
    return <div />
  },
}))

afterEach(() => {
  cleanup()
  recorded.slice = null
  recorded.dispatched = 0
  recorded.scrolled = 0
})

function renderAndGrabHandle(): NoteEditorHandle {
  let grabbed: NoteEditorHandle | null = null
  render(
    <NoteEditor
      initialContent=""
      handleRef={(handle) => {
        grabbed = handle
      }}
    />,
  )
  if (grabbed === null) {
    throw new Error('NoteEditor never delivered its handle')
  }
  return grabbed
}

describe('NoteEditorHandle.insertMarkdown', () => {
  it('parses the fragment and replaces the selection with an edge-open slice', () => {
    const handle = renderAndGrabHandle()
    handle.insertMarkdown('# Journal\n\nMood:\n\n- one\n- two\n')

    expect(recorded.dispatched).toBe(1)
    expect(recorded.scrolled).toBe(1)
    // Depth-1 open edges: single-paragraph fragments splice inline and
    // multi-block ones split the current block — paste semantics.
    expect(recorded.slice?.openStart).toBe(1)
    expect(recorded.slice?.openEnd).toBe(1)
    // heading + paragraph + two flat list items (meowdown's list schema is
    // flat — each item is a top-level block) survive the parse.
    expect(recorded.slice?.content.childCount).toBe(4)
  })

  it('no-ops on whitespace-only markdown', () => {
    const handle = renderAndGrabHandle()
    handle.insertMarkdown('  \n\n ')
    expect(recorded.dispatched).toBe(0)
    expect(recorded.slice).toBeNull()
  })
})
