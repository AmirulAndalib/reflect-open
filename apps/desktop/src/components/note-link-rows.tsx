import type { ReactElement } from 'react'

/** One row in a {@link NoteLinkRows} list: a note reference with optional context. */
export interface NoteLinkItem {
  /** Stable list identity (a path, or path:position for repeated sources). */
  key: string
  /** The note title shown as the row's main line. */
  title: string
  /** Context line under the title (the linking text, a snippet); `''` hides it. */
  snippet: string
  /** Graph-relative path to navigate to on click. */
  path: string
}

interface NoteLinkRowsProps {
  items: NoteLinkItem[]
  /** Open the clicked note (the host wires this to the router). */
  onOpen: (path: string) => void
}

/**
 * The note-reference rows every ambient-recall surface shares — the in-note
 * backlinks/related panels (via {@link NoteLinkList}) and the daily sidebar's
 * day sections — so a note link looks and behaves identically wherever it
 * appears. Hosts own the wrapper (section heading, collapsible section) and
 * the empty state; this is just the rows.
 */
export function NoteLinkRows({ items, onOpen }: NoteLinkRowsProps): ReactElement {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={() => onOpen(item.path)}
            className="w-full rounded px-2 py-1 text-left hover:bg-surface-hover"
          >
            <span className="block truncate text-sm font-medium">{item.title}</span>
            {item.snippet !== '' ? (
              <span className="block truncate text-xs text-text-muted">{item.snippet}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
