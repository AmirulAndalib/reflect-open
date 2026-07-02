import { useEffect } from 'react'
import { useSync } from '@/providers/sync-provider'

/**
 * The mobile resume trigger (Plan 19, step 10): foreground sync is cycle-on-
 * resume, and on iOS the reliable foreground signal is `visibilitychange`
 * (desktop's `focus`/`online` listeners live in the backup controller and
 * run here too — the engine's single-flight coalesces any overlap). Each
 * return to the foreground runs one full cycle: push what the background
 * flush committed, pull what other devices pushed meanwhile.
 *
 * An effect-holder component (the `EditorTextSizeEffect` pattern) so the
 * hook sits below the `SyncProvider` it reads.
 */
export function ResumeSyncEffect(): null {
  const { backup, backUpNow } = useSync()
  const connected = backup.phase === 'connected'

  useEffect(() => {
    if (!connected) {
      return
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void backUpNow()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [connected, backUpNow])

  return null
}
