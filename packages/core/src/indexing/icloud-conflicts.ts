import { z } from 'zod'
import { getBridge, type Unlisten } from '../ipc/bridge'

/** The Rust iCloud watch's conflict event (Plan 21 Phase 2). */
const ICLOUD_CONFLICTS_EVENT = 'icloud:conflicts'

const payloadSchema = z.array(z.string())

/**
 * Subscribe to the iCloud watch's conflict signal: graph-relative paths the
 * metadata query currently reports as carrying unresolved conflict versions.
 * The signal is a *trigger*, not a state store — it may repeat paths across
 * batches; the subscriber debounces into a conflict sweep, which is where
 * resolution actually happens.
 */
export function subscribeIcloudConflicts(
  handler: (paths: string[]) => void,
): Promise<Unlisten> {
  return getBridge().listen(ICLOUD_CONFLICTS_EVENT, (payload) => {
    const parsed = payloadSchema.safeParse(payload)
    if (parsed.success) {
      handler(parsed.data)
    } else {
      // Contract drift between the Rust event and this schema — loud beats
      // silently never sweeping.
      console.error('invalid icloud:conflicts payload:', parsed.error)
    }
  })
}
