import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dailyPath, hasBridge, suggestWikiTargets } from '@reflect/core'
import { usePinnedNotes } from '@/hooks/use-pinned-notes'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { SidebarNoteRow } from './sidebar-note-row'

const RECENTS_LIMIT = 8

/**
 * The sidebar's Recents section — the same recall feed the empty ⌘K palette
 * shows (recency-ordered title suggestions from the index), kept short: the
 * palette is the deep archive, this is ambient memory. Pinned notes are
 * excluded — they already sit one section up, and a duplicate row inches away
 * reads as a bug — so the fetch over-asks by the pinned count to keep the
 * section full.
 */
export function SidebarRecents(): ReactElement | null {
  const { graph } = useGraph()
  const pinned = usePinnedNotes()
  const pinnedPaths = new Set(pinned.map((note) => note.path))
  const { data: suggestions } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'sidebar-recents', pinned.length],
    queryFn: () => suggestWikiTargets('', RECENTS_LIMIT + pinned.length),
    enabled: hasBridge() && graph !== null,
  })

  const seen = new Set<string>()
  const entries = (suggestions ?? [])
    .flatMap((suggestion) => {
      // A pathless suggestion is a valid daily whose file doesn't exist yet (the
      // lazy-creation contract) — synthesize its daily path so it stays jumpable.
      const path = suggestion.path ?? (suggestion.date !== null ? dailyPath(suggestion.date) : null)
      if (path === null || seen.has(path) || pinnedPaths.has(path)) {
        return []
      }
      seen.add(path)
      return [{ path, title: suggestion.title, date: suggestion.date }]
    })
    .slice(0, RECENTS_LIMIT)

  if (entries.length === 0) {
    return null
  }

  return (
    <section aria-label="Recent notes">
      <h2 className="px-2.5 pb-1 pt-4 text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">
        Recents
      </h2>
      <ul className="flex flex-col gap-px">
        {entries.map((entry) => (
          <SidebarNoteRow key={entry.path} path={entry.path} title={entry.title} date={entry.date} />
        ))}
      </ul>
    </section>
  )
}
