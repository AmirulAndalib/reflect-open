import type { ReactElement } from 'react'
import { Square } from 'lucide-react'
import type { OpenTask } from '@reflect/core'

interface TaskRowProps {
  task: OpenTask
  /** Show the source-note title — date buckets aggregate tasks from many notes. */
  showSource: boolean
  onOpen: (notePath: string) => void
}

/**
 * One open task in the Tasks view: a read-only checkbox glyph and the task
 * text, which opens the source note on click or Enter (arrow keys move between
 * rows — see {@link TasksScreen}). Completing a task from here — the interactive
 * checkbox — lands in Plan 18 PR3; the glyph is decorative for now.
 */
export function TaskRow({ task, showSource, onOpen }: TaskRowProps): ReactElement {
  return (
    <li className="flex items-start gap-2">
      <Square aria-hidden className="mt-0.5 size-4 shrink-0 text-text-muted" strokeWidth={1.75} />
      <button
        type="button"
        data-task-row
        onClick={() => onOpen(task.notePath)}
        className="min-w-0 flex-1 text-left text-sm text-text hover:underline focus-visible:underline focus-visible:outline-none"
      >
        <span className="break-words">{task.text || 'Empty task'}</span>
        {showSource ? <span className="ml-2 text-xs text-text-muted">{task.noteTitle}</span> : null}
      </button>
    </li>
  )
}
