import { useEffect, type ReactElement } from 'react'
import { useSettings } from '@/providers/settings-provider'

/**
 * Applies the desktop note width preference to the document root.
 *
 * The note gutter itself lives in CSS (`.reflect-content-gutter`) because it
 * is shared by normal notes, daily-stream rows, and secondary note windows.
 */
export function EditorNoteWidthEffect(): ReactElement | null {
  const { settings } = useSettings()
  const noteWidth = settings.editorFullWidthNotes ? 'full' : 'fixed'

  useEffect(() => {
    document.documentElement.setAttribute('data-editor-note-width', noteWidth)
  }, [noteWidth])

  return null
}
