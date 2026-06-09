import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { isAppError, readNote, subscribeFileChanges, writeNote } from '@reflect/core'
import type { NoteEditorHandle } from './note-editor'

/**
 * The save pipeline + external-change reconciliation for one open note
 * (Plan 05 steps 4–5).
 *
 * Saves are debounced atomic writes (Plan 02); indexing is **not** triggered
 * here — the watcher is the sole incremental-reindex path (Plan 04b), so our own
 * write flows file → watcher → index like any other change. The same watcher
 * event comes back to us; we recognize the echo by content (it matches what we
 * last saved) and ignore it. A real external change reloads a clean buffer
 * imperatively, and **never clobbers a dirty one** — it parks as `conflict` for
 * the user to resolve.
 */

const SAVE_DEBOUNCE_MS = 800

export type NoteDocumentStatus = 'loading' | 'ready' | 'error'

export interface NoteDocument {
  status: NoteDocumentStatus
  /** Markdown to seed the editor with once `status` is `ready`. */
  initialContent: string
  /** True while the buffer has changes not yet written to disk. */
  dirty: boolean
  /** External content waiting on the user's choice (set only when dirty). */
  conflict: string | null
  error: string | null
  /** Wire to the editor: every document change enters the pipeline here. */
  onEditorChange: (markdown: string) => void
  /** Wire to the editor's imperative handle (reload/conflict application). */
  bindEditor: (handle: NoteEditorHandle | null) => void
  /** Resolve a conflict by keeping the buffer (rewrites the file). */
  keepMine: () => void
  /** Resolve a conflict by loading the external content (discards the buffer). */
  loadTheirs: () => void
}

export function useNoteDocument(path: string | null): NoteDocument {
  const [status, setStatus] = useState<NoteDocumentStatus>('loading')
  const [initialContent, setInitialContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const editorRef = useRef<NoteEditorHandle | null>(null)
  /** The buffer as of the last editor change. */
  const bufferRef = useRef('')
  /** The content most recently read from or written to disk. */
  const diskRef = useRef('')
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Serializes writes so a flush can't interleave with a debounced save. */
  const saveChain = useRef<Promise<void>>(Promise.resolve())

  const markClean = useCallback((content: string) => {
    diskRef.current = content
    dirtyRef.current = bufferRef.current !== content
    setDirty(dirtyRef.current)
  }, [])

  const save = useCallback(() => {
    if (!path || !dirtyRef.current) {
      return
    }
    const content = bufferRef.current
    saveChain.current = saveChain.current
      .then(() => writeNote(path, content))
      .then(() => markClean(content))
      .catch((err) => {
        setError(messageOf(err))
      })
  }, [path, markClean])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      save()
    }, SAVE_DEBOUNCE_MS)
  }, [save])

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    save()
  }, [save])

  const onEditorChange = useCallback(
    (markdown: string) => {
      bufferRef.current = markdown
      dirtyRef.current = markdown !== diskRef.current
      setDirty(dirtyRef.current)
      if (dirtyRef.current) {
        scheduleSave()
      }
    },
    [scheduleSave],
  )

  const bindEditor = useCallback((handle: NoteEditorHandle | null) => {
    editorRef.current = handle
  }, [])

  // Load the note when the path changes.
  useEffect(() => {
    if (!path) {
      return
    }
    let active = true
    setStatus('loading')
    setConflict(null)
    setError(null)
    void (async () => {
      try {
        const content = await readNote(path)
        if (!active) {
          return
        }
        bufferRef.current = content
        diskRef.current = content
        dirtyRef.current = false
        setDirty(false)
        setInitialContent(content)
        setStatus('ready')
      } catch (err) {
        if (active) {
          setError(messageOf(err))
          setStatus('error')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [path])

  // External-change reconciliation via the watcher (Plan 04b events).
  useEffect(() => {
    if (!path || !isTauri()) {
      return
    }
    let active = true
    let unlisten: (() => void) | null = null
    void subscribeFileChanges((changes) => {
      if (!active || !changes.some((change) => change.path === path && change.kind === 'upsert')) {
        return
      }
      void (async () => {
        let content: string
        try {
          content = await readNote(path)
        } catch {
          return // deleted/unreadable between event and read; nothing to reconcile
        }
        if (!active || content === diskRef.current) {
          return // echo of our own save (or a no-op change) — ignore
        }
        if (dirtyRef.current) {
          setConflict(content) // never clobber unsaved edits
          return
        }
        bufferRef.current = content
        markClean(content)
        editorRef.current?.setMarkdown(content)
      })()
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
  }, [path, markClean])

  // Flush pending edits on blur and on unmount/path change.
  useEffect(() => {
    if (!path) {
      return
    }
    window.addEventListener('blur', flush)
    return () => {
      window.removeEventListener('blur', flush)
      flush()
    }
  }, [path, flush])

  const keepMine = useCallback(() => {
    setConflict(null)
    dirtyRef.current = true // force the rewrite even if content drifted equal
    save()
  }, [save])

  const loadTheirs = useCallback(() => {
    if (conflict === null) {
      return
    }
    bufferRef.current = conflict
    markClean(conflict)
    editorRef.current?.setMarkdown(conflict)
    setConflict(null)
  }, [conflict, markClean])

  return {
    status,
    initialContent,
    dirty,
    conflict,
    error,
    onEditorChange,
    bindEditor,
    keepMine,
    loadTheirs,
  }
}

function messageOf(error: unknown): string {
  if (isAppError(error)) {
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}
