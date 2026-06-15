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
  /** ⌘↵: save any change, then complete the task (or delete it if emptied). */
  complete: () => void
  /** ⌘⌫: delete the task outright, discarding any pending edit. */
  delete: () => void
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
  /**
   * Complete the task and exit (⌘↵). `content` is the new text when the edit
   * changed it (save **and** complete), or `null` to complete the unchanged task.
   */
  onComplete: (content: string | null) => void
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
 * Finalizing is single-shot and idempotent — the first finalizer to run claims
 * the editor (so the row unmounting afterward can't double-fire a write): the
 * first of Enter, a real blur, or the row unmounting commits; Escape cancels;
 * empty + Backspace (or committing empty) deletes; ⌘↵ completes (saving the edit
 * first when changed); ⌘⌫ deletes outright. {@link resolveTaskEdit} turns the
 * current text vs. the seed into commit/cancel/delete, so a whitespace-only
 * change never rewrites the file. The commands are bound once via
 * {@link TaskEditorFinalizer.apiRef} but always call this render's callbacks —
 * the keymap closes over the ref, not a stale closure.
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
  onComplete,
}: TaskEditorFinalizerOptions): TaskEditorFinalizer {
  const currentRef = useRef(initial)
  const doneRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Bound once, but reassigned each render so the keymap's stable reference
  // always reaches this render's finalizers.
  const apiRef = useRef<TaskEditorApi>({
    commit: () => {},
    cancel: () => {},
    complete: () => {},
    delete: () => {},
    deleteEmpty: () => {},
    isEmpty: () => false,
  })
  // Each finalizer claims the editor once (doneRef): completing/deleting via a
  // shortcut sets it, so the row unmounting afterward can't double-fire a commit.
  const claim = (): boolean => {
    if (doneRef.current) {
      return false
    }
    doneRef.current = true
    return true
  }
  apiRef.current = {
    commit: () => {
      if (!claim()) {
        return
      }
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
      if (claim()) {
        onCancel()
      }
    },
    complete: () => {
      if (!claim()) {
        return
      }
      // Emptying then completing means delete (an empty task can't be "done");
      // an unchanged task just toggles; otherwise save the new text and complete.
      const result = resolveTaskEdit(initial, currentRef.current)
      if (result.type === 'delete') {
        onDelete()
      } else if (result.type === 'commit') {
        onComplete(result.content)
      } else {
        onComplete(null)
      }
    },
    delete: () => {
      if (claim()) {
        onDelete()
      }
    },
    deleteEmpty: () => {
      if (claim()) {
        onDelete()
      }
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
