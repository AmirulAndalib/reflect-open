import { useQuery } from '@tanstack/react-query'
import { getPinnedNotes, hasBridge, type PinnedNote } from '@reflect/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'

/**
 * The pinned notes from the index, kept fresh by the usual index invalidation
 * (a pin lands in the file, the watcher re-indexes it, the query refetches).
 * Shared by the sidebar's Pinned section and the Recents dedup — one query
 * key, so both consumers ride a single fetch.
 */
export function usePinnedNotes(): PinnedNote[] {
  const { graph } = useGraph()
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'pinned-notes'],
    queryFn: () => getPinnedNotes(),
    enabled: hasBridge() && graph !== null,
  })
  return data ?? []
}
