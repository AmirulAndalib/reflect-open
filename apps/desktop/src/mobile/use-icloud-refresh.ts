import { useEffect } from 'react'
import { errorMessage, hasBridge, icloudDownloadPending } from '@reflect/core'
import { useGraph } from '@/providers/graph-provider'

/**
 * A resume transition fires `visibilitychange` and `focus` together in
 * WKWebView (same window as the backup controller's resume triggers);
 * triggers inside this window collapse into one refresh.
 */
const RESUME_REFRESH_DEDUPE_MS = 1500

/**
 * While placeholders are still pending, poll the count at this interval and
 * reconcile the moment it reaches zero — note files are small, so downloads
 * usually land within a poll or two and the Mac edit appears in seconds.
 */
const PENDING_POLL_MS = 1000

/** Give up polling after this long; the metadata watch and the next resume
 * still cover stragglers (a large asset on a slow link, say). */
const PENDING_POLL_LIMIT_MS = 20_000

/**
 * Keeps an iCloud-stored graph fresh while the app is used (Plan 21).
 *
 * Mobile has no file watcher — local writes notify in-process, and for git
 * graphs remote changes only arrive through pull. iCloud is different: the
 * OS lands files in the container behind the app's back, and on iOS it
 * doesn't even download them until asked. The metadata-query watch nudges
 * downloads live while the app is open; this hook covers the resume seams
 * the query can miss: on every app resume (and once after the graph opens)
 * it nudges the pending downloads, re-runs the index reconcile, and while
 * placeholders remain it polls the pending count, reconciling the moment
 * downloads land instead of waiting for the next resume.
 *
 * Inert unless an iCloud graph is open (`mobileStorageKind === 'icloud'`).
 */
export function useICloudRefresh(): void {
  const { graph, mobileStorageKind, refreshIndex } = useGraph()
  const root = mobileStorageKind === 'icloud' ? (graph?.root ?? null) : null

  useEffect(() => {
    if (root === null || !hasBridge()) {
      return
    }
    let disposed = false
    let lastRefreshAt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const pollPending = (startedAt: number): void => {
      if (retryTimer !== null) {
        return
      }
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (disposed) {
          return
        }
        void icloudDownloadPending(root).then(
          (pending) => {
            if (disposed) {
              return
            }
            if (pending === 0 || Date.now() - startedAt >= PENDING_POLL_LIMIT_MS) {
              // Everything landed (or we're done waiting) — one reconcile
              // picks the batch up together.
              refreshIndex()
              return
            }
            pollPending(startedAt)
          },
          (err) => {
            console.error('iCloud pending poll failed:', errorMessage(err))
            if (!disposed) {
              refreshIndex()
            }
          },
        )
      }, PENDING_POLL_MS)
    }

    const refresh = async (): Promise<void> => {
      let pending = 0
      try {
        pending = await icloudDownloadPending(root)
      } catch (err) {
        // Best-effort: reconcile anyway — already-downloaded changes still land.
        console.error('iCloud download nudge failed:', errorMessage(err))
      }
      if (disposed) {
        return
      }
      refreshIndex()
      if (pending > 0) {
        pollPending(Date.now())
      }
    }

    const onResume = (): void => {
      const now = Date.now()
      if (now - lastRefreshAt < RESUME_REFRESH_DEDUPE_MS) {
        return
      }
      lastRefreshAt = now
      void refresh()
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        onResume()
      }
    }

    // Once on open: the reconcile that ran at open indexed what was already
    // local; this pass asks iCloud for the rest.
    onResume()
    window.addEventListener('focus', onResume)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
      }
      window.removeEventListener('focus', onResume)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [root, refreshIndex])
}
