import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dailyPath, hasBridge, relatedNotes } from '@reflect/core'
import { NoteLinkRows } from '@/components/note-link-rows'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'
import { SidebarSection } from './sidebar-section'

interface DayRelatedNotesProps {
  /** The day whose semantic neighbors to show (validated ISO date). */
  date: string
}

/**
 * Semantic neighbors of the day's note (the old app's "similar notes"),
 * seeded by the note's stored chunk vectors. Renders nothing at all when
 * there are no results — semantic search may be disabled or the day not yet
 * embedded, and an empty box would just advertise a missing feature.
 */
export function DayRelatedNotes({ date }: DayRelatedNotesProps): ReactElement | null {
  const { navigate } = useRouter()
  const { graph } = useGraph()
  const path = dailyPath(date)
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'related', path],
    queryFn: () => relatedNotes(path),
    enabled: hasBridge() && graph !== null,
  })

  const related = data ?? []
  if (related.length === 0) {
    return null
  }

  return (
    <SidebarSection storageKey="related" title="Related" count={related.length}>
      <NoteLinkRows
        items={related.map((hit) => ({
          key: hit.path,
          title: hit.title,
          snippet: hit.snippet,
          path: hit.path,
        }))}
        onOpen={(target) => navigate(routeForPath(target))}
      />
    </SidebarSection>
  )
}
