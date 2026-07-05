import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { OpenTask } from '@reflect/core'
import { resolveTaskEdit, taskContent, type TaskEditResult } from '@/lib/tasks/task-content'

/** The two writes the finalizer itself performs; {@link TaskActions} satisfies it. */
export interface TaskSheetWriteActions {
  edit: (task: OpenTask, content: string) => void
  remove: (tasks: OpenTask[]) => void
}

export interface TaskSheetFinalizerDeps {
  /** The task's **live** row — writes relocate by its current raw. */
  task: OpenTask
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: TaskSheetWriteActions
  /** Reset sheet-local presentation (collapse the calendar) on reopen. */
  onReseed: () => void
  /**
   * Read the editing surface's markdown, or null when the surface can't
   * answer. An uncontrolled editor can hold a change whose `onChange` hasn't
   * re-rendered into the mirrored draft yet; resolving against the live text
   * keeps that change from being dropped. Consulted only at interactive
   * decision points (dismissal, navigate, `resolve`) — the unmount flush uses
   * the mirrored state, because a surface mid-teardown can misreport empty.
   */
  readDraft?: () => string | null
}

export interface TaskSheetFinalizer {
  /** The editable markdown draft (the task's content after the marker). */
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  /** Resolve the draft against the frozen baseline: commit / cancel / delete. */
  resolve: () => TaskEditResult
  /** vaul's onOpenChange — a user dismissal finishes the visit first. */
  handleOpenChange: (open: boolean) => void
  /** Close after an action button took over the write (no dismissal commit). */
  closeHandled: () => void
  /** Commit a change / delete an emptied draft, then close — "Open note"'s flush. */
  closeNavigate: () => void
}

/**
 * The quick-edit sheet's commit/cancel/delete state machine (the mobile
 * analog of desktop's {@link useTaskEditorFinalizer}), pulled out of the
 * component so the exit rules live in one place:
 *
 * - The edit **baseline is frozen at open**: `task` is the live row, and if a
 *   reindex rewrites it while the sheet is up, comparing the untouched draft
 *   against the *new* content would read as an edit and commit stale text
 *   over the external change.
 * - The sheet stays mounted after closing (the exit animation needs content),
 *   so **reopening reseeds everything** — baseline and draft from the row's
 *   current raw (an action may have rewritten it), the handled flag, and the
 *   caller's presentation via `onReseed` — else a visit after Complete/
 *   Convert/Open note would silently drop its edits on dismiss.
 * - **Abandoning** (dismissal gesture, or a route change unmounting the open
 *   sheet) commits a changed draft, and deletes an emptied *or
 *   abandoned-empty* one — a "+"-added row left untyped must not ghost a bare
 *   `+ [ ]` in the note (V1's empty-task rule).
 * - **Navigating** ("Open note") commits a change and deletes an emptied
 *   draft, but never applies the abandoned-empty rule: an untouched empty
 *   task must not lose the very line the navigation shows.
 */
export function useTaskSheetFinalizer({
  task,
  open,
  onOpenChange,
  actions,
  onReseed,
  readDraft,
}: TaskSheetFinalizerDeps): TaskSheetFinalizer {
  const liveContent = taskContent(task.raw)
  const [initial, setInitial] = useState(liveContent)
  const [draft, setDraft] = useState(liveContent)
  // Set once an action button has already written/closed, so the dismissal
  // commit doesn't double-write on the close that follows.
  const [handled, setHandled] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setHandled(false)
      setInitial(liveContent)
      setDraft(liveContent)
      onReseed()
    }
  }

  // The freshest draft available at an *interactive* decision point (a
  // dismissal gesture, an action button) — the surface is mounted there. The
  // unmount flush must NOT use this: a surface mid-teardown can misreport
  // empty, and "empty" means delete.
  const currentDraft = (): string => readDraft?.() ?? draft

  const resolve = (): TaskEditResult => resolveTaskEdit(initial, currentDraft())

  /** Persist `current` vs the baseline: a real change commits, an emptied draft deletes. */
  const commitCurrent = (current: string): void => {
    const result = resolveTaskEdit(initial, current)
    if (result.type === 'commit') {
      actions.edit(task, result.content)
    } else if (result.type === 'delete') {
      actions.remove([task])
    }
  }

  const finishAbandonedVisit = (current: string): void => {
    if (resolveTaskEdit(initial, current).type === 'cancel' && current.trim() === '') {
      actions.remove([task])
    } else {
      commitCurrent(current)
    }
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && !handled) {
      // Mark handled before finishing: a duplicate dismissal callback, or the
      // unmount flush racing the parent's close re-render, must not run the
      // same commit/delete twice (a second delete would trip the stale guard
      // and surface a spurious failure).
      setHandled(true)
      finishAbandonedVisit(currentDraft())
    }
    onOpenChange(nextOpen)
  }

  const closeHandled = (): void => {
    setHandled(true)
    onOpenChange(false)
  }

  const closeNavigate = (): void => {
    commitCurrent(currentDraft())
    setHandled(true)
    onOpenChange(false)
  }

  // A route change (tab switch, back) can unmount the whole screen while the
  // drawer is open — no dismissal callback fires, so flush like a dismissal
  // would (desktop's inline editor flushes on unmount the same way). The
  // latest-closure ref keeps the unmount-only cleanup reading current state.
  // Resolve from the mirrored draft, never readDraft: the surface is tearing
  // down with us and can misreport empty, which would delete a real task.
  const unmountFlushRef = useRef<() => void>(() => {})
  useEffect(() => {
    unmountFlushRef.current = () => {
      if (open && !handled) {
        finishAbandonedVisit(draft)
      }
    }
  })
  useEffect(() => () => unmountFlushRef.current(), [])

  return { draft, setDraft, resolve, handleOpenChange, closeHandled, closeNavigate }
}
