import type { Unlisten } from '../ipc/bridge'
import { removeFromIndex } from './commands'
import { subscribeFileChanges, type FileChange } from './file-changes'
import { indexNote } from './indexer'

/**
 * Live re-indexing from the Rust watcher (Plan 04b). Batches of
 * {@link FileChange} arrive on `index:changed`; each is re-indexed or removed
 * at the subscription's `generation`. Late events from a previous graph carry
 * that graph's (now-stale) generation, so Rust drops their writes — the watcher
 * is the sole incremental-reindex path and can't corrupt a newly-opened index.
 */

/** Reports a change that failed to apply; the batch continues past it. */
export type ApplyErrorHandler = (error: unknown, change: FileChange) => void

const logApplyError: ApplyErrorHandler = (error, change) => {
  console.error(`failed to index change for ${change.path}:`, error)
}

/**
 * Apply a batch of watcher changes to the index at `generation`. A failing
 * change is reported (default: `console.error`) and skipped, so one unreadable
 * file can't stall the rest of the batch.
 */
export async function applyIndexChanges(
  changes: FileChange[],
  generation: number,
  onError: ApplyErrorHandler = logApplyError,
): Promise<void> {
  for (const change of changes) {
    try {
      if (change.kind === 'remove') {
        await removeFromIndex(change.path, generation)
      } else {
        await indexNote(change.path, { generation })
      }
    } catch (error) {
      onError(error, change)
    }
  }
}

/**
 * Subscribe to `index:changed` and apply each batch at `generation`. Returns an
 * unlisten function; call it (and resubscribe with the new generation) when the
 * active graph changes.
 *
 * `onApplied` fires after a batch has been written to the index — the hook for
 * cache invalidation (Plan 07's TanStack Query layer): invalidating on the raw
 * file event would refetch *before* the rows changed.
 */
export function subscribeIndexChanges(
  generation: number,
  onApplied?: (changes: FileChange[]) => void,
): Promise<Unlisten> {
  // Serialize batches so overlapping events for the same path can't reorder
  // (e.g. an upsert landing after a later remove, leaving a ghost row).
  let applyQueue: Promise<void> = Promise.resolve()
  return subscribeFileChanges((changes) => {
    applyQueue = applyQueue
      .then(() => applyIndexChanges(changes, generation))
      .then(() => {
        onApplied?.(changes)
      })
      .catch((error) => {
        console.error('failed to apply watcher batch:', error)
      })
  })
}
