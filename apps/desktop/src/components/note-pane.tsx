import { type ReactElement } from 'react'
import { NoteEditor } from '@/editor/note-editor'
import { useNoteDocument } from '@/editor/use-note-document'

interface NotePaneProps {
  /** Graph-relative path of the note to edit. */
  path: string
}

/**
 * One open note: the editor bound to its on-disk document via the Plan 05 save
 * pipeline (debounced atomic writes, watcher-driven external reload, and a
 * non-destructive conflict prompt when an external change races unsaved edits).
 * Plan 06 mounts one of these per day in the daily stream.
 */
export function NotePane({ path }: NotePaneProps): ReactElement {
  const document = useNoteDocument(path)

  if (document.status === 'loading') {
    return (
      <div className="px-1 py-2 text-sm text-[color:var(--text-muted)]">Loading note…</div>
    )
  }

  if (document.status === 'error') {
    return (
      <div role="alert" className="px-1 py-2 text-sm text-red-500">
        Couldn’t open {path}: {document.error}
      </div>
    )
  }

  return (
    <div className="relative">
      {document.conflict !== null ? (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <span className="min-w-0 flex-1">
            This note changed on disk while you had unsaved edits.
          </span>
          <button
            type="button"
            onClick={document.keepMine}
            className="rounded border border-current/30 px-2 py-0.5 font-medium"
          >
            Keep mine
          </button>
          <button
            type="button"
            onClick={document.loadTheirs}
            className="rounded border border-current/30 px-2 py-0.5 font-medium"
          >
            Load theirs
          </button>
        </div>
      ) : null}

      {document.dirty ? (
        <span
          aria-label="Unsaved changes"
          title="Unsaved changes"
          className="absolute -top-1 right-0 size-2 rounded-full bg-[var(--accent)]"
        />
      ) : null}

      <NoteEditor
        key={path}
        initialContent={document.initialContent}
        onChange={document.onEditorChange}
        handleRef={document.bindEditor}
      />
    </div>
  )
}
