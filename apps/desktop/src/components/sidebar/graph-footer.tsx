import type { ReactElement } from 'react'
import type { GraphInfo } from '@reflect/core'
import { Check, FolderOpen } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useGraph } from '@/providers/graph-provider'
import { useSync, type BackupState } from '@/providers/sync-provider'

const MENU_ITEM_CLASS = 'gap-2 px-2 py-1.5 text-[13px] text-text-secondary'

/**
 * The quiet backup indicator: nothing when backed up (or not set up), a
 * pulsing accent dot while backing up, amber when offline with queued
 * changes, red when backup needs attention. Detail lives in Settings.
 */
function backupDot(backup: BackupState): { className: string; label: string } | null {
  if (backup.phase !== 'connected' || backup.status.state === 'idle') {
    return null
  }
  switch (backup.status.state) {
    case 'syncing':
      return { className: 'bg-accent motion-safe:animate-pulse', label: 'Backing up' }
    case 'pending':
      return { className: 'bg-amber-500', label: 'Backup waiting for a connection' }
    case 'error':
      return { className: 'bg-red-500', label: 'Backup failed — see Settings' }
  }
}

/**
 * The sidebar footer: the graph's color swatch and name on the left — a
 * dropdown menu for switching to a recent graph or the OS folder picker. The
 * swatch pulses while the graph indexes; a small dot reports backup state.
 * The menu content matches the trigger width, so it stays inset from the
 * sidebar edges.
 */
export function GraphFooter({ graph }: { graph: GraphInfo }): ReactElement {
  const { recents, indexing, openRecent, pickAndOpen } = useGraph()
  const { backup } = useSync()
  const dot = backupDot(backup)

  return (
    <div className="flex items-center px-4 py-3">
      <DropdownMenu>
        <Tooltip delayDuration={700}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center space-x-2.5 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-5 w-5 flex-none rounded-md bg-accent',
                    indexing && 'motion-safe:animate-pulse',
                  )}
                />
                <span className="min-w-0 truncate text-xs font-medium text-text">
                  {graph.name}
                </span>
                {dot !== null ? (
                  <>
                    <span
                      aria-hidden
                      className={cn('h-1.5 w-1.5 flex-none rounded-full', dot.className)}
                    />
                    <span role="status" className="sr-only">
                      {dot.label}
                    </span>
                  </>
                ) : null}
                {indexing ? (
                  <span role="status" className="sr-only">
                    Indexing
                  </span>
                ) : null}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{graph.root}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent aria-label="Switch graph" side="top" sideOffset={6}>
          {recents.map((recent) => {
            const current = recent.root === graph.root
            return (
              <Tooltip key={recent.root} delayDuration={700}>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!current) {
                        void openRecent(recent.root)
                      }
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <span className="min-w-0 flex-1 truncate">{recent.name}</span>
                    {current ? (
                      <Check aria-hidden className="size-3.5 shrink-0 text-accent" />
                    ) : null}
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent side="right">{recent.root}</TooltipContent>
              </Tooltip>
            )
          })}
          {recents.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={() => void pickAndOpen()}
            className={MENU_ITEM_CLASS}
          >
            <FolderOpen aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Open another graph…</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
