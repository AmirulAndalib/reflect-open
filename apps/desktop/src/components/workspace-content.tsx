import { useCallback, type ReactElement } from 'react'
import type { GraphInfo } from '@reflect/core'
import { AppShell } from '@/components/app-shell'
import { CloudSyncBanner } from '@/components/cloud-sync-banner'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { EmbeddingsSync } from '@/components/embeddings-sync'
import { OperationsStatus } from '@/components/operations-status'
import { RouteContent } from '@/components/route-content'
import { WorkspaceHeader } from '@/components/workspace-header'
import { useAppVersion } from '@/hooks/use-app-version'
import { useGraph } from '@/providers/graph-provider'
import { useTheme } from '@/providers/theme-provider'
import { useAppShortcuts } from '@/routing/app-shortcuts'
import { useRouter } from '@/routing/router'

interface WorkspaceContentProps {
  graph: GraphInfo
}

/**
 * Everything inside the workspace's router/palette providers: the shell and
 * header around the route-driven content, plus the always-mounted global
 * surfaces (operations status, ⌘K palette, embeddings sync). Split from
 * {@link GraphWorkspace} because these hooks need the providers it mounts.
 */
export function WorkspaceContent({ graph }: WorkspaceContentProps): ReactElement {
  const { resolvedTheme, setTheme } = useTheme()
  const { indexing } = useGraph()
  const { navigate } = useRouter()
  const version = useAppVersion()
  const commandContext = useAppShortcuts()

  const toggleTheme = useCallback((): void => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const openSettings = useCallback((): void => {
    navigate({ kind: 'settings' })
  }, [navigate])

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
        <WorkspaceHeader
          graphName={graph.name}
          graphRoot={graph.root}
          indexing={indexing}
          version={version}
          resolvedTheme={resolvedTheme}
          onToggleTheme={toggleTheme}
          onOpenSettings={openSettings}
        />

        {graph.cloudSync ? <CloudSyncBanner provider={graph.cloudSync} /> : null}

        <div className="min-h-0 flex-1">
          <RouteContent />
        </div>

        <OperationsStatus />
        <CommandPalette context={commandContext} />
        <EmbeddingsSync />
      </div>
    </AppShell>
  )
}
