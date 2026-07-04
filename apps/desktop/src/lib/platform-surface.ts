/**
 * How the running surface differs from stock desktop, as module-scope facets
 * set once by the mobile root chunk at load — before any consumer renders —
 * the same pattern as core's `setLocalWriteEcho`. One module so the facets
 * don't multiply as parallel single-flag files.
 *
 * Facets are deliberately separate (a future iPad-with-keyboard build could
 * plausibly split them):
 * - `touchEditor` — editors apply iOS text-input hygiene (pinned
 *   `spellcheck=false`: WebKit derives the keyboard's smart-punctuation
 *   traits from it, and smart punctuation corrupts markdown syntax) and
 *   explicit input traits — see `EditorInputTraits` (Plan 19, decision 7).
 * - `mobileApp` — shared components render their mobile variants, e.g.
 *   touch-sized conflict-resolution actions in the protected note notice.
 */
export interface PlatformSurface {
  touchEditor: boolean
  mobileApp: boolean
}

let surface: PlatformSurface = { touchEditor: false, mobileApp: false }

/**
 * Set surface facets (merged over the current state). The mobile root chunk
 * calls this once at module scope; tests may toggle individual facets.
 */
export function setPlatformSurface(next: Partial<PlatformSurface>): void {
  surface = { ...surface, ...next }
}

/** True when editors render on a touch webview (the mobile app). */
export function isTouchEditorSurface(): boolean {
  return surface.touchEditor
}

/** True when the mobile surface tree is running (the mobile app). */
export function isMobileSurface(): boolean {
  return surface.mobileApp
}
