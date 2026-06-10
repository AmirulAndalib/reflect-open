import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hasBridge, retrieve } from '@reflect/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useEmbedStatus } from '@/lib/use-embed-status'
import { useGraph } from '@/providers/graph-provider'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'

interface RelatedNotesProps {
  /** The open note (excluded from its own results). */
  path: string
  /** Seed content (the note body; the first ~1k chars are plenty). */
  seed: string
}

const SEED_CHARS = 1200

/**
 * Semantic neighbors of the open note (Plan 09 — the "suggested backlinks"
 * deferred from Plan 07): the payoff surface for local embeddings. Renders
 * nothing until the model is ready, when the note is empty, or when nothing
 * relates — strictly additive, like the rest of semantic search.
 */
export function RelatedNotes({ path, seed }: RelatedNotesProps): ReactElement | null {
  const { navigate } = useRouter()
  const { graph } = useGraph()
  const status = useEmbedStatus()
  const ready = status.status === 'ready'
  const trimmedSeed = seed.trim().slice(0, SEED_CHARS)

  const { data } = useQuery({
    // The seed is part of the key: the same path re-seeded (reload, save,
    // external sync) must not serve neighbors computed from the old body.
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'related', path, trimmedSeed],
    queryFn: () => retrieve(trimmedSeed, { mode: 'semantic', limit: 7 }),
    enabled: ready && hasBridge() && graph !== null && trimmedSeed !== '',
  })

  const related = (data ?? []).filter((hit) => hit.path !== path).slice(0, 6)
  if (related.length === 0) {
    return null
  }

  return (
    <section
      aria-label="Related notes"
      className="mt-6 border-t border-black/5 pt-3 dark:border-white/5"
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
        Related
      </h3>
      <ul className="space-y-0.5">
        {related.map((hit) => (
          <li key={hit.path}>
            <button
              type="button"
              onClick={() => navigate(routeForPath(hit.path))}
              className="w-full rounded px-2 py-1 text-left hover:bg-black/5 dark:hover:bg-white/5"
            >
              <span className="block truncate text-sm font-medium">{hit.title}</span>
              {hit.snippet !== '' ? (
                <span className="block truncate text-xs text-[color:var(--text-muted)]">
                  {hit.snippet}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
