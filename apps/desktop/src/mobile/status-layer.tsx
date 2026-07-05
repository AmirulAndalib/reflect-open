import type { ReactElement } from 'react'
import { IndexProgressPill } from '@/mobile/index-progress-pill'
import { MobileOperationsPills } from '@/mobile/operations-pill'
import { SyncStatusPill } from '@/mobile/sync-status-pill'
import { useKeyboardVisible } from '@/mobile/use-keyboard'

/**
 * The one viewport-anchored slot for mobile status pills, stacked above the
 * tab bar: operation failures ({@link MobileOperationsPills}) over the sync
 * pill. `position: fixed` elements are viewport-anchored — the shell root's
 * keyboard yield doesn't apply — so the layer hides while the keyboard is up
 * and places itself via the height the tab bar publishes (the safe-area
 * fallback covers surfaces without one). The container ignores touches;
 * individual pills opt back in.
 */
export function MobileStatusLayer(): ReactElement | null {
  const keyboardVisible = useKeyboardVisible()

  if (keyboardVisible) {
    return null
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2"
      style={{
        bottom: 'calc(var(--mobile-tab-bar-height, env(safe-area-inset-bottom, 0px)) + 0.75rem)',
      }}
    >
      <MobileOperationsPills />
      <IndexProgressPill />
      <SyncStatusPill />
    </div>
  )
}
