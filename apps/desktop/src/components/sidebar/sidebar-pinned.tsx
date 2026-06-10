import type { ReactElement } from 'react'
import { usePinnedNotes } from '@/hooks/use-pinned-notes'
import { SidebarNoteRow } from './sidebar-note-row'

/**
 * The sidebar's Pinned section (the original app's "Pinned notes" shelf):
 * every note carrying `pinned: true` frontmatter, title-ordered, above the
 * Recents feed. Hidden entirely while nothing is pinned — an empty shelf is
 * sidebar noise, not an affordance.
 */
export function SidebarPinned(): ReactElement | null {
  const pinned = usePinnedNotes()

  if (pinned.length === 0) {
    return null
  }

  return (
    <section aria-label="Pinned notes">
      <h2 className="px-2.5 pb-1 pt-4 text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">
        Pinned
      </h2>
      <ul className="flex flex-col gap-px">
        {pinned.map((note) => (
          <SidebarNoteRow
            key={note.path}
            path={note.path}
            title={note.title}
            date={note.dailyDate}
          />
        ))}
      </ul>
    </section>
  )
}
