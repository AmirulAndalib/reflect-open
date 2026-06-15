import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type OpenTask } from '@reflect/core'
import { deleteTask, toggleTask } from '@/lib/note-task'
import { startOperation } from '@/lib/operations'
import { sameTask } from '@/lib/tasks/task-identity'
import { completedTasksQueryKey, tasksQueryKey } from '@/lib/tasks/tasks-query'
import { useGraph } from '@/providers/graph-provider'

/**
 * Bulk task actions for the Tasks view's keyboard shortcuts (Plan 18): complete
 * a selection (⌘↵) and delete a selection (⌫/⌘⌫). Both update the open and
 * completed caches optimistically — like {@link useCompleteTask} does for one
 * row — so the selection reacts instantly, then the reindex reconciles. A failed
 * write rolls every row back to the snapshot and surfaces the reason once.
 *
 * Writes within a batch run **sequentially**: tasks can share a note, and two
 * concurrent edits to one file would race (the loser's read predates the
 * winner's write). The core edits relocate by the task's `raw`, so the offset
 * drift a prior edit causes in the same note is tolerated, not a wrong write.
 */
export interface TaskActions {
  complete: (tasks: OpenTask[]) => void
  remove: (tasks: OpenTask[]) => void
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

  return {
    isPending: completeMutation.isPending || deleteMutation.isPending,
    complete: (tasks) => {
      if (tasks.length > 0 && graph?.generation !== undefined && !completeMutation.isPending) {
        completeMutation.mutate(tasks)
      }
    },
    remove: (tasks) => {
      if (tasks.length > 0 && graph?.generation !== undefined && !deleteMutation.isPending) {
        deleteMutation.mutate(tasks)
      }
    },
  }
}
