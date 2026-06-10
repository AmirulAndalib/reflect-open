import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getBacklinksWithContext, hasBridge } from '@reflect/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'

/**
 * Incoming backlinks under a note (Plan 07): source title + the line around
 * the link, click to open. Ambient and always-available — the associative
 * recall the product is built on — and cheap: one indexed query per visible
 * note, kept fresh by the index invalidation hook (no polling). Renders
 * nothing when the note has no inbound links.
 */
export function BacklinksPanel({ path }: { path: string }): ReactElement | null {
  const { navigate } = useRouter()
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, 'backlinks', path],
    queryFn: () => getBacklinksWithContext(path),
    enabled: hasBridge(),
  })

  if (!data || data.length === 0) {
    return null
  }

  return (
    <section
      aria-label="Backlinks"
      className="mt-6 border-t border-black/5 pt-3 dark:border-white/5"
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
        Linked from
      </h3>
      <ul className="space-y-0.5">
        {data.map((backlink) => (
          <li key={`${backlink.sourcePath}:${backlink.posFrom}`}>
            <button
              type="button"
              onClick={() => navigate(routeForPath(backlink.sourcePath))}
              className="w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="block text-sm font-medium">{backlink.sourceTitle}</span>
              {backlink.snippet !== '' ? (
                <span className="block truncate text-xs text-[color:var(--text-muted)]">
                  {backlink.snippet}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
