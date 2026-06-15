import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type OpenTask } from '@reflect/core'
import { deleteTask, editTask, toggleTask } from '@/lib/note-task'
import { startOperation } from '@/lib/operations'
import { sameTask } from '@/lib/tasks/task-identity'
import { completedTasksQueryKey, tasksQueryKey } from '@/lib/tasks/tasks-query'
import { useGraph } from '@/providers/graph-provider'

/**
 * Bulk task actions for the Tasks view's keyboard shortcuts (Plan 18): complete
 * a selection (⌘↵) and delete it (⌘⌫ unconditionally; plain ⌫ removes only the
 * empty rows). Both update the open and completed caches optimistically — like
 * {@link useCompleteTask} does for one row — so the selection reacts instantly,
 * then the reindex reconciles. A failed write rolls every row back to the
 * snapshot and surfaces the reason once.
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

interface CacheSnapshot {
  previousOpen: OpenTask[] | undefined
  previousCompleted: OpenTask[] | undefined
}

export function useTaskActions(): TaskActions {
  const { graph } = useGraph()
  const queryClient = useQueryClient()
  const openKey = tasksQueryKey(graph?.root)
  const completedKey = completedTasksQueryKey(graph?.root)

  const isSelf = (task: OpenTask, set: OpenTask[]): boolean => set.some((row) => sameTask(row, task))

  const snapshot = async (): Promise<CacheSnapshot> => {
    await queryClient.cancelQueries({ queryKey: openKey })
    await queryClient.cancelQueries({ queryKey: completedKey })
    return {
      previousOpen: queryClient.getQueryData<OpenTask[]>(openKey),
      previousCompleted: queryClient.getQueryData<OpenTask[]>(completedKey),
    }
  }

  const rollback = (context: CacheSnapshot | undefined, label: string, cause: unknown): void => {
    if (context?.previousOpen !== undefined) {
      queryClient.setQueryData(openKey, context.previousOpen)
    }
    if (context?.previousCompleted !== undefined) {
      queryClient.setQueryData(completedKey, context.previousCompleted)
    }
    startOperation(label).fail(errorMessage(cause))
  }

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
      const context = await snapshot()
      // Drop the completed rows from the open list, and (when archived is on)
      // prepend them as checked to the completed list so they stay visible struck.
      queryClient.setQueryData<OpenTask[]>(openKey, (rows) =>
        rows?.filter((row) => !isSelf(row, tasks)),
      )
      queryClient.setQueryData<OpenTask[]>(completedKey, (rows) =>
        rows
          ? [
              ...tasks.map((task) => ({ ...task, checked: true })),
              ...rows.filter((row) => !isSelf(row, tasks)),
            ]
          : rows,
      )
      return context
    },
    onError: (cause, _tasks, context) => rollback(context, 'Completing tasks', cause),
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
      const context = await snapshot()
      // A delete removes the task from both lists outright.
      queryClient.setQueryData<OpenTask[]>(openKey, (rows) =>
        rows?.filter((row) => !isSelf(row, tasks)),
      )
      queryClient.setQueryData<OpenTask[]>(completedKey, (rows) =>
        rows?.filter((row) => !isSelf(row, tasks)),
      )
      return context
    },
    onError: (cause, _tasks, context) => rollback(context, 'Deleting tasks', cause),
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
      const context = await snapshot()
      // Rebuild the row's `raw` from its (unchanged) marker so the display and
      // the next edit's staleness guard track the new text before the reindex.
      // The bucket may change once the index re-derives the due date; until then
      // the row stays put with its new text.
      const marker = task.checked ? '[x]' : '[ ]'
      const raw = content === '' ? marker : `${marker} ${content}`
      const patch = (rows: OpenTask[] | undefined): OpenTask[] | undefined =>
        rows?.map((row) => (sameTask(row, task) ? { ...row, raw, text: content } : row))
      queryClient.setQueryData<OpenTask[]>(openKey, patch)
      queryClient.setQueryData<OpenTask[]>(completedKey, patch)
      return context
    },
    onError: (cause, _vars, context) => rollback(context, 'Editing task', cause),
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
