import type { ReactElement } from 'react'
import { NoteLinkRows, type NoteLinkItem } from '@/components/note-link-rows'

interface NoteLinkListProps {
  /** Accessible name of the section (e.g. "Backlinks", "Related notes"). */
  ariaLabel: string
  /** The section heading text. */
  heading: string
  items: NoteLinkItem[]
  /** Open the clicked note (the host wires this to the router). */
  onOpen: (path: string) => void
}

/**
 * A note-context section under an open note (today the semantic neighbors'
 * "Related" panel), keeping panels thin query adapters over one shared
 * presentation. The rows themselves are {@link NoteLinkRows}, shared with
 * the daily sidebar's day sections. Backlinks render separately in old
 * Reflect's grouped style ({@link BacklinksPanel}).
 */
export function NoteLinkList({
  ariaLabel,
  heading,
  items,
  onOpen,
}: NoteLinkListProps): ReactElement {
  return (
    <section
      aria-label={ariaLabel}
      className="mt-6 border-t border-black/5 pt-3 dark:border-white/5"
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {heading}
      </h3>
      <NoteLinkRows items={items} onOpen={onOpen} />
    </section>
  )
}
