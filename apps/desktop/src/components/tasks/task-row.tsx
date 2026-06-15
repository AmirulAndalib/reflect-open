import type { ReactElement } from 'react'
import { ArrowRight, Circle, CircleCheck } from 'lucide-react'
import type { OpenTask } from '@reflect/core'
import { formatDayLabel } from '@/lib/dates'
import { useCompleteTask } from '@/lib/tasks/use-complete-task'
import { cn } from '@/lib/utils'
import { useSettings } from '@/providers/settings-provider'
import { TaskText } from './task-text'

interface TaskRowProps {
  task: OpenTask
  /** Show the source-note date — date buckets aggregate tasks from many notes. */
  showSource: boolean
  onOpen: (notePath: string) => void
}

/**
 * One task row in the Tasks view (V1 design): a circle checkbox that completes
 * the task (the guarded write-back, Plan 18), the task content with inline date
 * and link chips ({@link TaskText}), the source-note date on the right, and a
 * navigation arrow. Completing optimistically drops the row; an archived
 * (completed) row shows struck through. The checkbox is the arrow-navigable
 * element (↑/↓ between rows, Space to complete — see {@link TasksScreen}).
 */
export function TaskRow({ task, showSource, onOpen }: TaskRowProps): ReactElement {
  const { settings } = useSettings()
  const { complete, isPending } = useCompleteTask(task)
  const done = task.checked || isPending
  const label = task.text || 'Empty task'

  return (
    <li className="group/task flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface-hover">
      <button
        type="button"
        data-task-row
        aria-label={task.checked ? 'Completed task' : `Complete: ${label}`}
        disabled={task.checked || isPending}
        onClick={complete}
        className="mt-px shrink-0 text-text-muted transition-colors hover:text-text focus-visible:text-text focus-visible:outline-none disabled:cursor-default"
      >
        {done ? (
          <CircleCheck aria-hidden className="size-[18px] text-accent" strokeWidth={2} />
        ) : (
          <Circle aria-hidden className="size-[18px]" strokeWidth={2} />
        )}
      </button>
      <button
        type="button"
        onClick={() => onOpen(task.notePath)}
        className={cn(
          'min-w-0 flex-1 break-words text-left text-sm leading-6 text-text focus-visible:outline-none',
          task.checked && 'text-text-muted line-through',
        )}
      >
        <TaskText task={task} />
      </button>
      {showSource && task.dailyDate !== null ? (
        <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-text-muted">
          {formatDayLabel(task.dailyDate, settings.dateFormat)}
        </span>
      ) : null}
      <ArrowRight aria-hidden className="mt-1 size-3.5 shrink-0 text-text-muted/60" />
    </li>
  )
}
