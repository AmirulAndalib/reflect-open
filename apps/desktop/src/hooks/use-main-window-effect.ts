import { useEffect, type DependencyList, type EffectCallback } from 'react'
import { isMainWindow } from '@/lib/windows/window-role'

/**
 * `useEffect` that runs only in the MAIN window — the mount point for every
 * app-wide singleton: sync/backup and iCloud controllers, the capture drain,
 * the transcription reconciler, asset describing, update checks, the OS
 * deep-link intake. A secondary note window mounting a second instance would
 * double-run AI passes, git work, and index writes, so new background
 * controllers must come through here (or carry an explicit `isMainWindow()`
 * gate, like `EmbeddingsSync`, whose gating is data-flow rather than an
 * effect). The window-ownership rule itself is documented on
 * `lib/windows/window-role.ts`.
 *
 * `deps` are checked by `react-hooks/exhaustive-deps` via the config's
 * `additionalHooks` — treat this exactly like `useEffect`.
 */
export function useMainWindowEffect(effect: EffectCallback, deps: DependencyList): void {
  useEffect(() => {
    if (!isMainWindow()) {
      return
    }
    return effect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the wrapper forwards its caller's deps verbatim
  }, deps)
}
