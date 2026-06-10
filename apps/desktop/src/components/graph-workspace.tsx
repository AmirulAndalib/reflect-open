import type { ReactElement } from 'react'
import type { GraphInfo } from '@reflect/core'
import { PaletteProvider } from '@/components/command-palette/palette-provider'
import { WorkspaceContent } from '@/components/workspace-content'
import { RouterProvider } from '@/routing/router'

interface GraphWorkspaceProps {
  graph: GraphInfo
}

/**
 * The main surface once a graph is open (Plan 06): mounts the per-graph
 * providers — the typed router and the ⌘K palette — around
 * {@link WorkspaceContent}. The app opens to today's daily note, the
 * chronological spine. Keyed by the graph root so switching graphs starts a
 * fresh history.
 */
export function GraphWorkspace({ graph }: GraphWorkspaceProps): ReactElement {
  return (
    <RouterProvider key={graph.root}>
      <PaletteProvider>
        <WorkspaceContent graph={graph} />
      </PaletteProvider>
    </RouterProvider>
  )
}
