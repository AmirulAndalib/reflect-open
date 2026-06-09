import { useCallback, useEffect, useRef, useState } from 'react'
import { hasBridge, readNote, subscribeFileChanges, writeNote } from '@reflect/core'
import type { NoteEditorHandle } from './note-editor'
import {
  createNoteSession,
  INITIAL_NOTE_SNAPSHOT,
  type NoteSession,
  type NoteSessionSnapshot,
} from './note-session'
import { checkRoundTrip } from './roundtrip'

/**
 * React adapter over the {@link createNoteSession} document state machine: one
 * session per open `(path, generation)`, wired to the `@reflect/core` file
 * commands, the watcher event stream, and the editor's imperative handle. All
 * save/conflict/protection semantics live in `note-session.ts`.
 */

export interface NoteDocument extends NoteSessionSnapshot {
  /** Wire to the editor: every document change enters the pipeline here. */
  onEditorChange: (markdown: string) => void
  /** Wire to the editor's imperative handle (reload/conflict application). */
  bindEditor: (handle: NoteEditorHandle | null) => void
  /** Resolve a conflict by keeping the buffer (rewrites the file). */
  keepMine: () => void
  /** Resolve a conflict by loading the external content (discards the buffer). */
  loadTheirs: () => void
}

export interface NoteDocumentOptions {
  /**
   * Treat a missing file as an empty note instead of an error. The file is then
   * created by the first save — Plan 06's lazy daily-note contract: opening a
   * day never litters the graph; writing does.
   */
  createIfMissing?: boolean
}

/**
 * @param path graph-relative path of the open note
 * @param generation the open graph's session generation (`GraphInfo.generation`);
 *   pins every write to that graph — Rust rejects a write whose generation is
 *   stale, so a flush racing a graph switch can't land in the new graph.
 */
export function useNoteDocument(
  path: string | null,
  generation: number | null,
  options?: NoteDocumentOptions,
): NoteDocument {
  const createIfMissing = options?.createIfMissing ?? false
  const [snapshot, setSnapshot] = useState<NoteSessionSnapshot>(INITIAL_NOTE_SNAPSHOT)
  const editorRef = useRef<NoteEditorHandle | null>(null)
  const sessionRef = useRef<NoteSession | null>(null)

  useEffect(() => {
    if (!path) {
      return
    }
    const session = createNoteSession({
      path,
      io: {
        read: readNote,
        write:
          generation === null
            ? null
            : (forPath, contents) => writeNote(forPath, contents, generation),
      },
      classify: checkRoundTrip,
      onSnapshot: setSnapshot,
      applyContent: (markdown) => editorRef.current?.setMarkdown(markdown),
      createIfMissing,
    })
    sessionRef.current = session
    session.load()
    return () => {
      if (sessionRef.current === session) {
        sessionRef.current = null
      }
      // Disposal flushes pending edits to the session's own path — the
      // path-switch "final flush" lives here, not in cross-note bookkeeping.
      session.dispose()
    }
  }, [path, generation, createIfMissing])

  // External-change reconciliation via the watcher (Plan 04b events).
  useEffect(() => {
    if (!path || !hasBridge()) {
      return
    }
    let active = true
    let unlisten: (() => void) | null = null
    void subscribeFileChanges((changes) => {
      if (!active || !changes.some((change) => change.path === path && change.kind === 'upsert')) {
        return
      }
      sessionRef.current?.externalChanged()
    }).then((fn) => {
      if (active) {
        unlisten = fn
      } else {
        fn()
      }
    })
    return () => {
      active = false
      unlisten?.()
    }
  }, [path])

  // Flush pending edits when the window loses focus.
  useEffect(() => {
    if (!path) {
      return
    }
    const flush = (): void => sessionRef.current?.flush()
    window.addEventListener('blur', flush)
    return () => {
      window.removeEventListener('blur', flush)
    }
  }, [path])

  const onEditorChange = useCallback((markdown: string) => {
    sessionRef.current?.editorChanged(markdown)
  }, [])

  const bindEditor = useCallback((handle: NoteEditorHandle | null) => {
    editorRef.current = handle
  }, [])

  const keepMine = useCallback(() => {
    sessionRef.current?.keepMine()
  }, [])

  const loadTheirs = useCallback(() => {
    sessionRef.current?.loadTheirs()
  }, [])

  return { ...snapshot, onEditorChange, bindEditor, keepMine, loadTheirs }
}
