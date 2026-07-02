/**
 * Whether the app is running as the mobile surface tree. Set once by the
 * mobile root chunk at module load — the same pattern as `setLocalWriteEcho`
 * and `setTouchEditorSurface`. Shared components read it where mobile v1
 * deliberately renders a reduced variant of a desktop affordance — e.g. sync
 * conflict *resolution* stays desktop-side (Plan 19), so the conflict notice
 * shows "needs review on desktop" instead of the resolution actions.
 */
let mobileSurface = false

/** Mark the app as the mobile surface tree. Mobile root chunk only. */
export function setMobileSurface(value: boolean): void {
  mobileSurface = value
}

/** True when the mobile surface tree is running (the mobile app). */
export function isMobileSurface(): boolean {
  return mobileSurface
}
