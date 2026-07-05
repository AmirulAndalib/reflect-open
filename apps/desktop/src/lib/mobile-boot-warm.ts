import { mobileStorage, type MobileStorageInfo } from '@reflect/core'

/**
 * Boot-time head start for the mobile storage resolve (Plan 21). Resolving
 * the iCloud container (`URLForUbiquityContainerIdentifier` plus the graph
 * scan) is the slowest IPC on the mobile boot path, and it depends on
 * nothing else — not settings, not React. {@link warmMobileStorage} starts
 * the call as soon as the shell reports a mobile platform, so it overlaps
 * the mobile chunk's fetch/eval and the settings read instead of running
 * after both; the graph bootstrap adopts the in-flight promise via
 * {@link takeWarmMobileStorage}.
 *
 * Consume-once by design: the warm slot is a boot hint, not a cache.
 * Storage roots must be derived fresh everywhere else (container paths
 * change across restore/update), so a taken — or never-started — slot just
 * means the consumer makes its own fresh call.
 */
let warmed: Promise<MobileStorageInfo> | null = null

/**
 * Start the storage resolve early (idempotent). Rejections are handled by
 * whoever takes the promise; the guard here only silences the
 * unhandled-rejection report when nothing ever does.
 */
export function warmMobileStorage(): void {
  if (warmed === null) {
    warmed = mobileStorage()
    warmed.catch(() => {})
  }
}

/** The in-flight warm resolve, or null when none was started or it was
 * already taken. */
export function takeWarmMobileStorage(): Promise<MobileStorageInfo> | null {
  const pending = warmed
  warmed = null
  return pending
}
