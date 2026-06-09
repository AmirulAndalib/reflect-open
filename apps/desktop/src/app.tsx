import { type ReactElement } from 'react'
import { GraphChooser } from '@/components/graph-chooser'
import { GraphWorkspace } from '@/components/graph-workspace'
import { useGraph } from '@/providers/graph-provider'

/**
 * Root component — the Plan 02 loading gate. Routes between the graph chooser
 * and the workspace based on whether a graph is open. Real product surfaces
 * (daily notes, search, AI) hang off the workspace in later plans.
 */
export function App(): ReactElement {
  const { status, graph } = useGraph()

  if (status === 'ready' && graph) {
    return <GraphWorkspace graph={graph} />
  }

  if (status === 'choosing') {
    return <GraphChooser />
  }

  // 'loading' | 'opening'
  return (
    <div className="flex h-screen w-screen items-center justify-center text-sm text-[color:var(--text-muted)]">
      Loading…
    </div>
  )
}
