import { useEffect } from 'react'
import { setWindowTitle } from '@/lib/windows/window-title'

/**
 * Keep a note window's OS title on its current note (route changes and
 * renames alike — the title rides the same index row the pane shows), so
 * the Window menu and ⌘-backtick cycling can tell windows apart. `null`
 * while the title is unknown (row still loading, or a route without one)
 * falls back to the app name.
 */
export function useNoteWindowTitle(title: string | null): void {
  useEffect(() => {
    setWindowTitle(title ?? 'Reflect')
  }, [title])
}
