import type { ReactElement } from 'react'
import { RouteContent } from '@/components/route-content'

/**
 * A secondary note window's whole surface (⌘-click → new window): the routed
 * view, full-bleed — no workspace sidebar, no context panel, no palette or
 * dialogs. A note window is an editing surface; every other affordance lives
 * in the main window.
 */
export function NoteWindowContent(): ReactElement {
  // Mirrors AppShell's main region (bg-surface text-text): without it the
  // window shows the webview's default background.
  return (
    <div className="h-screen w-screen overflow-hidden bg-surface text-text">
      <RouteContent />
    </div>
  )
}
