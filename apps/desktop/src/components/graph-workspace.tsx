import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { getAppVersion, type GraphInfo } from '@reflect/core'
import { AppShell } from '@/components/app-shell'
import { DailyView } from '@/components/daily-view'
import { NotePane } from '@/components/note-pane'
import { todayIso } from '@/lib/dates'
import { useTheme } from '@/providers/theme-provider'
import { useAppShortcuts } from '@/routing/app-shortcuts'
import { RouterProvider, useRouter } from '@/routing/router'

const CLOUD_LABELS: Record<string, string> = {
  icloud: 'iCloud Drive',
  dropbox: 'Dropbox',
  googleDrive: 'Google Drive',
  oneDrive: 'OneDrive',
}

interface GraphWorkspaceProps {
  graph: GraphInfo
}

/**
 * The main surface once a graph is open: the shell + header around the
 * route-driven content (Plan 06). The app opens to today's daily note — the
 * chronological spine — and all navigation goes through the typed router.
 * Keyed by the graph root so switching graphs starts a fresh history.
 */
export function GraphWorkspace({ graph }: GraphWorkspaceProps): ReactElement {
  return (
    <RouterProvider key={graph.root}>
      <WorkspaceContent graph={graph} />
    </RouterProvider>
  )
}

function WorkspaceContent({ graph }: GraphWorkspaceProps): ReactElement {
  const { resolvedTheme, setTheme } = useTheme()
  const [version, setVersion] = useState<string | null>(null)
  useAppShortcuts()

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const result = await getAppVersion()
        if (active) {
          setVersion(result)
        }
      } catch {
        if (active) {
          setVersion(null)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const toggleTheme = useCallback((): void => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const cloudLabel = graph.cloudSync ? (CLOUD_LABELS[graph.cloudSync] ?? graph.cloudSync) : null

  return (
    <AppShell
      rail={
        <span className="text-xs font-semibold text-[color:var(--text-secondary)]">R</span>
      }
      sidebar={
        <div className="p-4 text-sm text-[color:var(--text-secondary)]">Context</div>
      }
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-black/10 px-6 py-3 dark:border-white/10">
          <h1 className="truncate text-sm font-semibold" title={graph.root}>
            {graph.name}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[color:var(--text-muted)]">v{version ?? '—'}</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium dark:border-white/10"
            >
              {resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode
            </button>
          </div>
        </header>

        {cloudLabel ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-700 dark:text-amber-300">
            This graph is inside {cloudLabel}. Reflect syncs via GitHub — a cloud-synced
            folder is unsupported and can corrupt the local index. Consider moving it to a
            non-synced location.
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-2xl flex-1 overflow-auto px-6 py-8">
          <RouteContent />
        </div>
      </div>
    </AppShell>
  )
}

/** Route → view. `today` resolves the date at render so midnight rolls over. */
function RouteContent(): ReactElement {
  const { route } = useRouter()
  switch (route.kind) {
    case 'today':
      return <DailyView date={todayIso()} />
    case 'daily':
      return <DailyView date={route.date} />
    case 'note':
      return <NotePane path={route.path} lazy />
    case 'search':
      return (
        <div className="text-sm text-[color:var(--text-muted)]">
          Search arrives in Plan 08.
        </div>
      )
  }
}
