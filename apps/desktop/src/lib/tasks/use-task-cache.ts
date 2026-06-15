import { useQueryClient } from '@tanstack/react-query'
import { errorMessage, type OpenTask } from '@reflect/core'
import { startOperation } from '@/lib/operations'
import { completedTasksQueryKey, tasksQueryKey } from '@/lib/tasks/tasks-query'
import { useGraph } from '@/providers/graph-provider'

/** Updates a cached task list in place; returning the same `undefined` is a no-op. */
type TaskListPatch = (rows: OpenTask[] | undefined) => OpenTask[] | undefined

/** The open + completed task lists captured before an optimistic write, for rollback. */
export interface TaskCacheSnapshot {
  open: OpenTask[] | undefined
  completed: OpenTask[] | undefined
}

export interface TaskCacheWriter {
  /** Cancel in-flight refetches and capture both lists so a failed write can roll back. */
  snapshot: () => Promise<TaskCacheSnapshot>
  /** Optimistically rewrite the open and completed lists at once. */
  patch: (open: TaskListPatch, completed: TaskListPatch) => void
  /** Restore both lists from a snapshot and surface the failure once. */
  rollback: (captured: TaskCacheSnapshot | undefined, label: string, cause: unknown) => void
}

/**
 * Shared optimistic write/rollback for the two task caches — the open list and
 * the completed ("archived") list — keyed on the active graph. Every Tasks-view
 * mutation (single-row checkbox, bulk complete, delete, inline edit) goes
 * through the same snapshot → patch → rollback path, so the optimistic shapes
 * (see {@link withoutTasks}/{@link asCompleted}/{@link withEditedTask}) can't
 * drift between the single-row and bulk code paths.
 *
 * `patch` mirrors a change across BOTH lists; a list that isn't loaded (the
 * completed list with archived off) stays untouched when its patch returns the
 * same `undefined`. `rollback` restores the captured lists and raises one
 * operations toast labelled for the action.
 */
export function useTaskCacheWriter(): TaskCacheWriter {
  const { graph } = useGraph()
  const queryClient = useQueryClient()
  const openKey = tasksQueryKey(graph?.root)
  const completedKey = completedTasksQueryKey(graph?.root)

  const snapshot = async (): Promise<TaskCacheSnapshot> => {
    await queryClient.cancelQueries({ queryKey: openKey })
    await queryClient.cancelQueries({ queryKey: completedKey })
    return {
      open: queryClient.getQueryData<OpenTask[]>(openKey),
      completed: queryClient.getQueryData<OpenTask[]>(completedKey),
    }
  }

  const patch = (open: TaskListPatch, completed: TaskListPatch): void => {
    queryClient.setQueryData<OpenTask[]>(openKey, open)
    queryClient.setQueryData<OpenTask[]>(completedKey, completed)
  }

  const rollback = (
    captured: TaskCacheSnapshot | undefined,
    label: string,
    cause: unknown,
  ): void => {
    if (captured?.open !== undefined) {
      queryClient.setQueryData(openKey, captured.open)
    }
    if (captured?.completed !== undefined) {
      queryClient.setQueryData(completedKey, captured.completed)
    }
    startOperation(label).fail(errorMessage(cause))
  }

  return { snapshot, patch, rollback }
}
