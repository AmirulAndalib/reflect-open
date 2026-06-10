import type { ReactElement } from 'react'
import { NoteActionsSection } from './note-actions-section'
import { SimilarNotesSection } from './similar-notes-section'

interface NoteContextSidebarProps {
  /** Graph-relative path of the open note the sidebar describes. */
  path: string
}

/**
 * An ordinary note's contextual sidebar: the note's semantic neighbors —
 * the only place similar notes appear — and note actions. Inbound links
 * live under the note itself (the incoming-backlinks panel), not here.
 * Rendered in the AppShell's right region on `note` routes.
 */
export function NoteContextSidebar({ path }: NoteContextSidebarProps): ReactElement {
  return (
    <div className="flex flex-col px-2 py-2 text-text">
      <SimilarNotesSection path={path} />
      <NoteActionsSection path={path} />
    </div>
  )
}
