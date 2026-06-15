import type { ReactElement } from 'react'
import { ListFilter } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TaskFilters, TaskFiltersControl } from '@/lib/tasks/task-filters'

const BUCKET_FILTERS: ReadonlyArray<{ key: keyof TaskFilters; label: string }> = [
  { key: 'pinned', label: 'Pinned tasks' },
  { key: 'current', label: 'Current tasks' },
  { key: 'overdue', label: 'Overdue tasks' },
  { key: 'upcoming', label: 'Upcoming tasks' },
  { key: 'other', label: 'Other tasks' },
]

/**
 * The Tasks view's "Task filters" dropdown (V1): per-bucket toggles plus
 * "Show archived tasks". Toggling keeps the menu open (`preventDefault` on
 * select) so several filters can be flipped at once.
 */
export function TaskFiltersMenu({ filters, toggle }: TaskFiltersControl): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:text-text focus-visible:text-text focus-visible:outline-none">
        <ListFilter aria-hidden className="size-4" />
        Task filters
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Tasks</DropdownMenuLabel>
        {BUCKET_FILTERS.map(({ key, label }) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={filters[key]}
            onCheckedChange={() => toggle(key)}
            onSelect={(event) => event.preventDefault()}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filters.archived}
          onCheckedChange={() => toggle('archived')}
          onSelect={(event) => event.preventDefault()}
        >
          Show archived tasks
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
