import { embedStatus, errorMessage, rebuildIndex } from '@reflect/core'
import { startOperation } from '@/lib/operations'
import { invalidateIndexQueries } from '@/lib/query-client'
import { backfillEmbeddingsVisibly } from '@/lib/semantic'

/**
 * Full index rebuild with user-visible status: wipe and re-derive the SQLite
 * projection from the markdown files, refresh the query caches, and re-embed
 * if semantic search is on. Shared by the `index.rebuild` palette command and
 * the settings page's Rebuild index button so the whole recipe stays one
 * definition. The index is a rebuildable cache — a full rebuild is always
 * safe and never touches the notes themselves.
 */
export async function rebuildIndexVisibly(generation: number): Promise<void> {
  const operation = startOperation('Rebuilding search index')
  try {
    await rebuildIndex({ generation })
    operation.done()
  } catch (cause) {
    operation.fail(errorMessage(cause))
    return
  }
  // A manual rebuild bypasses the watcher pipeline (whose onApplied refreshes
  // the caches), so cached note lists, backlinks, and tags would otherwise
  // show pre-rebuild rows until some unrelated change invalidated them.
  invalidateIndexQueries()
  // index_clear wiped the embedding tables with everything else — rebuild
  // them too, or semantic search stays silently empty until some other
  // trigger re-embeds.
  const embed = await embedStatus()
  if (embed.status === 'ready') {
    await backfillEmbeddingsVisibly({ generation, modelId: embed.model })
  }
}
