import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import {
  getCompletedTasks,
  getOpenTasks,
  groupTasks,
  hasBridge,
  type OpenTask,
  type TaskGroup,
} from '@reflect/core'
import { Input } from '@/components/ui/input'
import { taskKey } from '@/lib/tasks/task-identity'
import { useTaskActions } from '@/lib/tasks/use-task-actions'
import { useTaskFilters, type TaskFilters } from '@/lib/tasks/task-filters'
import { useTaskSelection } from '@/lib/tasks/use-task-selection'
import { completedTasksQueryKey, tasksQueryKey } from '@/lib/tasks/tasks-query'
import { useScrollRestoration } from '@/lib/use-scroll-restoration'
import { useToday } from '@/lib/use-today'
import { useGraph } from '@/providers/graph-provider'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'
import { TaskFiltersMenu } from './task-filters-menu'
import { TaskGroupSection } from './task-group-section'

/** Keep only the groups the active filters allow (V1's per-bucket toggles). */
function visibleGroups(groups: TaskGroup[], filters: TaskFilters): TaskGroup[] {
  return groups.filter((group) => {
    switch (group.kind) {
      case 'current':
        return filters.current
      case 'overdue':
        return filters.overdue
      case 'upcoming':
        return filters.upcoming
      case 'note':
        return group.tasks[0]?.isPinned ? filters.pinned : filters.other
    }
  })
}

/**
 * The Tasks view (Plan 18), in V1's design: every open checkbox across the graph
 * grouped into sticky, colour-coded sections — Current / Overdue / Upcoming (by
 * the task's due date, else its note's daily date) and then by note — read from
 * the SQLite projection and kept fresh by the index invalidation hook. A search
 * box filters by text; the "Task filters" menu toggles which buckets show and
 * reveals completed ("archived") tasks. Owns its scroll container so the sticky
 * headers and the toolbar stay put; per-entry scroll memory mirrors All Notes.
 *
 * Rows are multi-selectable (V1 parity): click to select, ⌘/Shift to extend, and
 * keyboard shortcuts act on the selection — ⌘A select all, ↑/↓ (Shift to extend),
 * ⌘↵ complete, ⌘⌫ delete (plain ⌫ deletes only empty rows), Esc clear. A sole
 * selection opens the inline editor.
 */
export function TasksScreen(): ReactElement {
  const { graph } = useGraph()
  const { navigate } = useRouter()
  const today = useToday()
  const { filters, toggle } = useTaskFilters()
  const [query, setQuery] = useState('')
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const enabled = hasBridge() && graph !== null

  const { data: open, isError: openFailed } = useQuery({
    queryKey: tasksQueryKey(graph?.root),
    queryFn: () => getOpenTasks(),
    enabled,
  })
  const { data: completed, isError: completedFailed } = useQuery({
    queryKey: completedTasksQueryKey(graph?.root),
    queryFn: () => getCompletedTasks(),
    enabled: enabled && filters.archived,
  })

  // Either read failing surfaces the alert — a failed completed read must not
  // leave `ready` stuck (and the list blank) just because its data never arrived.
  // The completed error only counts while archived is on: TanStack keeps the last
  // error on the disabled query, so turning archived off must clear it.
  const isError = openFailed || (filters.archived && completedFailed)
  // When archived is on, the list merges open + completed, so the empty state
  // must wait for both — else a graph with only completed tasks flashes "No
  // tasks to show." while the completed query is still loading.
  const ready = open !== undefined && (!filters.archived || completed !== undefined)
  const { onScroll } = useScrollRestoration(scrollElement, ready)

  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => {
    if (open === undefined) {
      return []
    }
    const all = filters.archived && completed ? [...open, ...completed] : open
    const matched = needle ? all.filter((task) => task.text.toLowerCase().includes(needle)) : all
    return visibleGroups(groupTasks(matched, today), filters)
  }, [open, completed, filters, needle, today])

  // The flat, render-order list of tasks the selection and its shortcuts act on.
  const orderedTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups])
  const orderedKeys = useMemo(() => orderedTasks.map(taskKey), [orderedTasks])
  const tasksByKey = useMemo(
    () => new Map(orderedTasks.map((task) => [taskKey(task), task])),
    [orderedTasks],
  )
  const selection = useTaskSelection(orderedKeys)
  const actions = useTaskActions()

  // The keydown handler closes over this render's state, but is registered once
  // — a ref carries the latest closure so the listener stays stable.
  const handleKeyRef = useRef<(event: KeyboardEvent) => void>(() => {})
  handleKeyRef.current = (event) => {
    // Respect anything a focused widget already handled (e.g. the filters menu's
    // own arrow/Escape navigation).
    if (event.defaultPrevented) {
      return
    }
    const target = event.target as HTMLElement | null
    // Only the Tasks screen's own surface drives these shortcuts — or the body
    // when nothing is focused. A portaled overlay (the filters menu, a future
    // dialog) renders outside the root, so its keys are never hijacked.
    const onSurface = target === document.body || (target !== null && (rootRef.current?.contains(target) ?? false))
    if (!onSurface) {
      return
    }
    const inSearch = target instanceof HTMLInputElement
    const inEditor = target?.closest?.('[data-task-editor]') != null
    const mod = event.metaKey || event.ctrlKey
    const selectedTasks = (): OpenTask[] =>
      [...selection.selected].map((key) => tasksByKey.get(key)).filter((t): t is OpenTask => !!t)

    // While editing a sole task the inline editor owns its keys — typing, ⌘A to
    // select its text, and ⌘↵ commit / ⌘⌫ delete for that one task. The bulk
    // shortcuts below must NOT also fire: a ⌘⌫ that both deletes here and lets
    // the editor commit on unmount would race two writes to the same line.
    if (inEditor) {
      return
    }
    if (inSearch) {
      if (event.key === 'Escape') {
        setQuery('')
        selection.clear()
        target.blur()
      }
      return
    }
    if (mod && event.key === 'Enter') {
      event.preventDefault()
      actions.complete(selectedTasks())
    } else if (mod && event.key === 'Backspace') {
      event.preventDefault()
      actions.remove(selectedTasks())
      selection.clear()
    } else if (event.key === 'Backspace') {
      // Plain ⌫ deletes only empty rows (V1) — never content, so a stray
      // Backspace can't lose work; ⌘⌫ above is the unconditional delete. The
      // sole-empty case runs in the inline editor; this covers a multi-selection.
      const empties = selectedTasks().filter((row) => row.text.trim() === '')
      if (empties.length > 0) {
        event.preventDefault()
        actions.remove(empties)
      }
    } else if (mod && (event.key === 'a' || event.key === 'A')) {
      event.preventDefault()
      selection.selectAll()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (event.shiftKey) {
        selection.extend(1)
      } else {
        selection.move(1)
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (event.shiftKey) {
        selection.extend(-1)
      } else {
        selection.move(-1)
      }
    } else if (event.key === 'Escape') {
      if (selection.selectedCount > 0) {
        selection.clear()
      } else if (query !== '') {
        setQuery('')
      }
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => handleKeyRef.current(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  return (
    <div ref={rootRef} aria-label="Tasks" className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none items-center gap-2 border-b border-border py-2.5 pl-2 pr-3 lg:pl-10">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search tasks"
            className="h-9 border-none bg-transparent pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
        <TaskFiltersMenu filters={filters} toggle={toggle} />
      </header>
      <div
        ref={setScrollElement}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto pb-8"
      >
        {isError ? (
          <p role="alert" className="px-4 py-6 text-sm text-text-muted lg:px-12">
            Couldn’t load tasks.
          </p>
        ) : ready && groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted lg:px-12">
            {needle ? 'No matching tasks.' : 'No tasks to show.'}
          </p>
        ) : (
          groups.map((group: TaskGroup) => (
            <TaskGroupSection
              key={group.kind === 'note' ? `note:${group.notePath}` : group.kind}
              group={group}
              selection={selection}
              actions={actions}
              onOpen={(path) => navigate(routeForPath(path))}
            />
          ))
        )}
      </div>
    </div>
  )
}
