import { useMutation } from '@tanstack/react-query'
import { type OpenTask } from '@reflect/core'
import { deleteTask, editTask, toggleTask } from '@/lib/note-task'
import { asCompleted, withEditedTask, withoutTasks } from '@/lib/tasks/task-cache'
import { useTaskCacheWriter } from '@/lib/tasks/use-task-cache'
import { useGraph } from '@/providers/graph-provider'

/**
 * Bulk task actions for the Tasks view's keyboard shortcuts (Plan 18): complete
 * a selection (⌘↵), delete a selection (⌫/⌘⌫), and edit one task from the inline
 * editor. All three update the open and completed caches optimistically through
 * the shared {@link useTaskCacheWriter} — the same path single-row
 * {@link useCompleteTask} takes — so the selection reacts instantly, then the
 * reindex reconciles. A failed write rolls every row back and surfaces the
 * reason once.
 *
 * Writes within a batch run **sequentially**: tasks can share a note, and two
 * concurrent edits to one file would race (the loser's read predates the
 * winner's write). The core edits relocate by the task's `raw`, so the offset
 * drift a prior edit causes in the same note is tolerated, not a wrong write.
 */
export interface TaskActions {
  complete: (tasks: OpenTask[]) => void
  remove: (tasks: OpenTask[]) => void
  /** Replace one task's content from the inline editor (Plan 18). */
  edit: (task: OpenTask, content: string) => void
  isPending: boolean
}

export function useTaskActions(): TaskActions {
  const { graph } = useGraph()
  const cache = useTaskCacheWriter()

  const completeMutation = useMutation({
    mutationFn: async (tasks: OpenTask[]) => {
      const generation = graph?.generation
      if (generation === undefined) {
        throw new Error('No graph is open.')
      }
      for (const task of tasks) {
        await toggleTask(task, generation)
      }
    },
    onMutate: async (tasks: OpenTask[]) => {
      const snapshot = await cache.snapshot()
      // Drop the completed rows from the open list, and (when archived is on)
      // prepend them as checked to the completed list so they stay visible struck.
      cache.patch(
        (rows) => withoutTasks(rows, tasks),
        (rows) => asCompleted(rows, tasks),
      )
      return snapshot
    },
    onError: (cause, _tasks, context) => cache.rollback(context, 'Completing tasks', cause),
  })

  const deleteMutation = useMutation({
    mutationFn: async (tasks: OpenTask[]) => {
      const generation = graph?.generation
      if (generation === undefined) {
        throw new Error('No graph is open.')
      }
      for (const task of tasks) {
        await deleteTask(task, generation)
      }
    },
    onMutate: async (tasks: OpenTask[]) => {
      const snapshot = await cache.snapshot()
      // A delete removes the task from both lists outright.
      cache.patch(
        (rows) => withoutTasks(rows, tasks),
        (rows) => withoutTasks(rows, tasks),
      )
      return snapshot
    },
    onError: (cause, _tasks, context) => cache.rollback(context, 'Deleting tasks', cause),
  })

  const editMutation = useMutation({
    mutationFn: ({ task, content }: { task: OpenTask; content: string }) => {
      const generation = graph?.generation
      if (generation === undefined) {
        throw new Error('No graph is open.')
      }
      return editTask(task, content, generation)
    },
    onMutate: async ({ task, content }: { task: OpenTask; content: string }) => {
      const snapshot = await cache.snapshot()
      // Show the new text in both lists before the reindex; the row keeps its
      // place until the index re-derives any due date (see withEditedTask).
      cache.patch(
        (rows) => withEditedTask(rows, task, content),
        (rows) => withEditedTask(rows, task, content),
      )
      return snapshot
    },
    onError: (cause, _vars, context) => cache.rollback(context, 'Editing task', cause),
  })

  return {
    isPending: completeMutation.isPending || deleteMutation.isPending || editMutation.isPending,
    complete: (tasks) => {
      // ⌘↵ *completes*; with archived rows in the selection, toggling an
      // already-checked task would reopen it on disk. Only act on open rows.
      const open = tasks.filter((task) => !task.checked)
      if (open.length > 0 && graph?.generation !== undefined && !completeMutation.isPending) {
        completeMutation.mutate(open)
      }
    },
    remove: (tasks) => {
      if (tasks.length > 0 && graph?.generation !== undefined && !deleteMutation.isPending) {
        deleteMutation.mutate(tasks)
      }
    },
    edit: (task, content) => {
      if (graph?.generation !== undefined) {
        editMutation.mutate({ task, content })
      }
    },
  }
}
