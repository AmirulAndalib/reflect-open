import { backfillEmbeddings, embedEnsure, type EmbedStatus } from '@reflect/core'
import { startOperation } from '@/lib/operations'

/**
 * Semantic-search enablement (Plan 09). The model is ~90MB and downloads from
 * the network, so it is **opt-in**: the `semantic.enable` command flips a
 * persisted flag and kicks the first download; later launches auto-load from
 * the local cache because the flag is set. Acceptance: "first semantic use
 * downloads the model with progress; later uses are instant."
 */

const ENABLED_KEY = 'reflect.semantic.enabled'

export function semanticEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setSemanticEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled))
  } catch {
    // best-effort; the command can be re-run
  }
}

/** Load (downloading if needed) the model, visibly. Resolves with the outcome. */
export async function ensureEmbeddingsVisibly(): Promise<EmbedStatus> {
  const operation = startOperation('Loading semantic search model')
  try {
    const status = await embedEnsure()
    if (status.status === 'failed') {
      operation.fail(status.message)
    } else {
      operation.done()
    }
    return status
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    operation.fail(message)
    return { status: 'failed', message }
  }
}

/** Embed every indexed note (incremental — the hash-skip makes re-runs cheap). */
export async function backfillEmbeddingsVisibly(options: {
  generation: number
  modelId: string
  isStale?: () => boolean
}): Promise<void> {
  const operation = startOperation('Indexing notes for semantic search')
  try {
    await backfillEmbeddings({
      ...options,
      onProgress: (done, total) => operation.progress(done, total),
    })
    operation.done()
  } catch (cause) {
    operation.fail(cause instanceof Error ? cause.message : String(cause))
  }
}
