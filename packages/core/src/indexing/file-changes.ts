import { z } from 'zod'
import { getBridge, type Unlisten } from '../ipc/bridge'

/**
 * The `index:changed` event stream from the Rust file watcher (Plan 04b): the
 * subscription primitive only — payload validation and fan-out to a handler.
 * What to *do* with a change lives one layer up (`live.ts` re-indexes; the
 * editor reconciles the open note).
 */

/** Event name the Rust watcher emits tracked-file changes on. */
export const FILE_CHANGES_EVENT = 'index:changed'

const fileChangeSchema = z.object({
  path: z.string(),
  kind: z.enum(['upsert', 'remove']),
  /**
   * The file's last-modified time (epoch ms), present on upserts. The re-index
   * path stamps `notes.mtime` from it; removes (and older payloads) omit it.
   */
  modifiedMs: z.number().optional(),
})
const fileChangesSchema = z.array(fileChangeSchema)

/** A single tracked change reported by the watcher. */
export type FileChange = z.infer<typeof fileChangeSchema>

/**
 * Subscribe to the raw {@link FILE_CHANGES_EVENT} batches (zod-validated).
 * The general notification primitive: the indexing subscription builds on it,
 * and the editor (Plan 05) uses it for external-change reconciliation of the
 * open note.
 */
export function subscribeFileChanges(
  handler: (changes: FileChange[]) => void,
): Promise<Unlisten> {
  return getBridge().listen(FILE_CHANGES_EVENT, (payload) => {
    const parsed = fileChangesSchema.safeParse(payload)
    if (parsed.success) {
      handler(parsed.data)
    } else {
      // A malformed payload means the Rust↔TS event contract drifted — loud
      // beats silently-stale indexes and editors.
      console.error('invalid index:changed payload:', parsed.error)
    }
  })
}
