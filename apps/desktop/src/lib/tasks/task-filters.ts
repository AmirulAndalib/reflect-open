import { useSessionFlag } from '@/lib/use-session-flag'

/**
 * Which task groups the Tasks view shows (V1's task filter store). The five date
 * / pin buckets default on; `archived` (completed tasks) defaults off. Pinned vs
 * other distinguishes tasks in pinned notes from those in ordinary notes — the
 * two per-note group families V1 lets you toggle independently.
 */
export interface TaskFilters {
  pinned: boolean
  current: boolean
  overdue: boolean
  upcoming: boolean
  other: boolean
  archived: boolean
}

export interface TaskFiltersControl {
  filters: TaskFilters
  toggle: (key: keyof TaskFilters) => void
}

/**
 * The Tasks view's filter state, persisted per-session (shared live across any
 * mounted reader, like the other session flags). One flag per filter so a toggle
 * round-trips through the same storage every other view uses.
 */
export function useTaskFilters(): TaskFiltersControl {
  const [pinned, setPinned] = useSessionFlag('reflect.tasks.filter.pinned', true)
  const [current, setCurrent] = useSessionFlag('reflect.tasks.filter.current', true)
  const [overdue, setOverdue] = useSessionFlag('reflect.tasks.filter.overdue', true)
  const [upcoming, setUpcoming] = useSessionFlag('reflect.tasks.filter.upcoming', true)
  const [other, setOther] = useSessionFlag('reflect.tasks.filter.other', true)
  const [archived, setArchived] = useSessionFlag('reflect.tasks.filter.archived', false)

  const filters: TaskFilters = { pinned, current, overdue, upcoming, other, archived }
  const setters: Record<keyof TaskFilters, (next: boolean) => void> = {
    pinned: setPinned,
    current: setCurrent,
    overdue: setOverdue,
    upcoming: setUpcoming,
    other: setOther,
    archived: setArchived,
  }

  return {
    filters,
    toggle: (key) => setters[key](!filters[key]),
  }
}
