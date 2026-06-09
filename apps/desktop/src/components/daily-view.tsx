import { type ReactElement } from 'react'
import { dailyPath } from '@reflect/core'
import { NotePane } from '@/components/note-pane'
import { addDaysIso, formatDayLabel, todayIso } from '@/lib/dates'
import { useRouter } from '@/routing/router'

interface DailyViewProps {
  /** ISO `YYYY-MM-DD` of the day to show. */
  date: string
}

/**
 * One day of the daily stream (Plan 06): the date header with prev/today/next
 * navigation over the single-note editor, opened lazily — the file is only
 * created on the first keystroke. The virtualized multi-day stream (06b) mounts
 * these per day.
 */
export function DailyView({ date }: DailyViewProps): ReactElement {
  const { navigate } = useRouter()
  const isToday = date === todayIso()

  return (
    <div className="flex h-full flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {formatDayLabel(date)}
          {isToday ? (
            <span className="ml-2 align-middle text-xs font-medium text-[color:var(--accent)]">
              Today
            </span>
          ) : null}
        </h2>
        <nav className="flex items-center gap-1" aria-label="Daily navigation">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => navigate({ kind: 'daily', date: addDaysIso(date, -1) })}
            className="rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/10"
          >
            ←
          </button>
          {!isToday ? (
            <button
              type="button"
              onClick={() => navigate({ kind: 'today' })}
              className="rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/10"
            >
              Today
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Next day"
            onClick={() => navigate({ kind: 'daily', date: addDaysIso(date, 1) })}
            className="rounded-md border border-black/10 px-2 py-1 text-xs dark:border-white/10"
          >
            →
          </button>
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        <NotePane path={dailyPath(date)} lazy />
      </div>
    </div>
  )
}
