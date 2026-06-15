import { type OpenTask } from '@reflect/core'
import { sameTask } from '@/lib/tasks/task-identity'

/**
 * Pure transforms over a cached task list ({@link OpenTask}[]), the optimistic
 * shapes the Tasks view applies before the reindex reconciles. Each takes the
 * current list (possibly `undefined` when a query isn't loaded) and returns the
 * next, leaving `undefined` untouched so a not-loaded completed list (archived
 * off) is a no-op. They identify rows by {@link sameTask}, the same key the
 * React rows and the mutations use, so an optimistic edit can't target the wrong
 * row. Kept apart from the mutation hooks so they're unit-testable directly and
 * shared by every Tasks write — single-row and bulk alike.
 */

/** Drop every row matching one of `tasks` from a cached list. */
export function withoutTasks(
  rows: OpenTask[] | undefined,
  tasks: OpenTask[],
): OpenTask[] | undefined {
  return rows?.filter((row) => !tasks.some((task) => sameTask(row, task)))
}

/**
 * Move `tasks` to the front of the completed list as checked, de-duping any
 * already present — the optimistic shape of completing them with archived on, so
 * the rows stay visible struck through instead of vanishing until the refetch.
 */
export function asCompleted(
  rows: OpenTask[] | undefined,
  tasks: OpenTask[],
): OpenTask[] | undefined {
  if (rows === undefined) {
    return rows
  }
  const kept = rows.filter((row) => !tasks.some((task) => sameTask(row, task)))
  return [...tasks.map((task) => ({ ...task, checked: true })), ...kept]
}

/**
 * The `raw` line a task would have after an inline edit: its marker (and so the
 * checked state) kept, the content after it replaced. Empty content clears to a
 * bare marker, matching the disk edit ({@link editTaskLine}).
 */
export function taskRawWithContent(task: OpenTask, content: string): string {
  const marker = task.checked ? '[x]' : '[ ]'
  return content === '' ? marker : `${marker} ${content}`
}

/**
 * Rewrite one task's content (and its `raw`) in a cached list before the reindex
 * re-derives it. The row keeps its place — the bucket only moves once the index
 * re-reads any due date — but shows the new text, and its rebuilt `raw` keeps the
 * next edit's staleness guard honest.
 */
export function withEditedTask(
  rows: OpenTask[] | undefined,
  task: OpenTask,
  content: string,
): OpenTask[] | undefined {
  const raw = taskRawWithContent(task, content)
  return rows?.map((row) => (sameTask(row, task) ? { ...row, raw, text: content } : row))
}
