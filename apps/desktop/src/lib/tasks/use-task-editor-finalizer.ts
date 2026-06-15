import {
  useCallback,
  useEffect,
  useRef,
  type FocusEvent,
  type MutableRefObject,
  type RefObject,
} from 'react'
import { resolveTaskEdit } from '@/lib/tasks/task-content'

/** The finalizer commands a task editor's keymap binds to Enter/Escape/Backspace. */
export interface TaskEditorApi {
  commit: () => void
  cancel: () => void
  deleteEmpty: () => void
  isEmpty: () => boolean
}

export interface TaskEditorFinalizerOptions {
  /** The content the editor was seeded with — the baseline a commit compares against. */
  initial: string
  /** Persist the new content (non-empty, changed) and exit edit mode. */
  onCommit: (content: string) => void
  /** Delete the task (emptied or backspaced-empty) and exit edit mode. */
  onDelete: () => void
  /** Exit edit mode without writing (Escape / unchanged). */
  onCancel: () => void
}

export interface TaskEditorFinalizer {
  /** Stable across renders; carries this render's finalizers to the bound keymap. */
  apiRef: MutableRefObject<TaskEditorApi>
  /** Attach to the editor's wrapper so a blur can tell when focus truly left. */
  rootRef: RefObject<HTMLDivElement | null>
  /** Feed every editor change so a commit sees the latest markdown. */
  onChange: (markdown: string) => void
  /** Wire to the wrapper's `onBlur`: commits once focus leaves the editor for good. */
  onBlur: (event: FocusEvent<HTMLDivElement>) => void
}

/**
 * The inline task editor's commit/cancel/delete state machine (Plan 18), kept
 * apart from the editor view so the finalizing rules are one cohesive, testable
 * unit.
 *
 * Finalizing is single-shot and idempotent: the first of Enter, a real blur, or
 * the row unmounting (the selection moved off it) commits; Escape cancels; an
 * empty editor + Backspace, or committing empty, deletes. {@link resolveTaskEdit}
 * turns the current text vs. the seed into commit/cancel/delete, so a
 * whitespace-only change never rewrites the file. The commands are bound once
 * via {@link TaskEditorFinalizer.apiRef} but always call this render's
 * callbacks — the keymap closes over the ref, not a stale closure.
 *
 * A blur is deferred a tick: the `[[`/`#` menus refocus the editor after
 * inserting, so only a focus that has genuinely left `rootRef` commits — a
 * bounce back in is not a commit.
 */
export function useTaskEditorFinalizer({
  initial,
  onCommit,
  onDelete,
  onCancel,
}: TaskEditorFinalizerOptions): TaskEditorFinalizer {
  const currentRef = useRef(initial)
  const doneRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Bound once, but reassigned each render so the keymap's stable reference
  // always reaches this render's finalizers.
  const apiRef = useRef<TaskEditorApi>({
    commit: () => {},
    cancel: () => {},
    deleteEmpty: () => {},
    isEmpty: () => false,
  })
  apiRef.current = {
    commit: () => {
      if (doneRef.current) {
        return
      }
      doneRef.current = true
      const result = resolveTaskEdit(initial, currentRef.current)
      if (result.type === 'commit') {
        onCommit(result.content)
      } else if (result.type === 'delete') {
        onDelete()
      } else {
        onCancel()
      }
    },
    cancel: () => {
      if (doneRef.current) {
        return
      }
      doneRef.current = true
      onCancel()
    },
    deleteEmpty: () => {
      if (doneRef.current) {
        return
      }
      doneRef.current = true
      onDelete()
    },
    isEmpty: () => currentRef.current.trim() === '',
  }

  // Commit any pending edit when the row unmounts (the selection moved off it).
  useEffect(() => () => apiRef.current.commit(), [])

  const onChange = useCallback((markdown: string) => {
    currentRef.current = markdown
  }, [])

  const onBlur = useCallback((_event: FocusEvent<HTMLDivElement>) => {
    window.setTimeout(() => {
      if (!doneRef.current && rootRef.current && !rootRef.current.contains(document.activeElement)) {
        apiRef.current.commit()
      }
    }, 0)
  }, [])

  return { apiRef, rootRef, onChange, onBlur }
}
