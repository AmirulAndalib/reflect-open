import { useState, type ReactElement } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEditor } from '@prosekit/react'
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from '@prosekit/react/autocomplete'
import { hasBridge, suggestWikiTargets } from '@reflect/core'
import { formatDayLabel } from '@/lib/dates'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { buildAutocompleteEntries } from './wiki-autocomplete-entries'

/**
 * The `[[` autocomplete popover (Plan 07): typing `[[` queries the index over
 * titles, aliases, and dailies (ranked in `@reflect/core`); Enter inserts the
 * chosen link as **literal text** — wiki links are literal syntax + decorations
 * in the meowdown model, so there is no node to insert and no serializer
 * surface to extend. The popup owns keyboard traversal (↑/↓/Enter/Esc) and
 * deletes the matched `[[query` before `onSelect` runs.
 */

/** `[[` plus a partial target; a typed `]` or `[` ends the match. */
const WIKI_TRIGGER = /\[\[([^[\]]*)$/u

interface WikiAutocompleteProps {
  /**
   * Create the typed note on the create row (create-from-unresolved). The
   * link text is inserted afterwards either way — a failed create leaves an
   * unresolved link, which clicking creates later.
   */
  onCreate?: (title: string) => Promise<void>
}

export function WikiAutocomplete({ onCreate }: WikiAutocompleteProps): ReactElement {
  const editor = useEditor()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, 'wiki-suggest', query],
    queryFn: () => suggestWikiTargets(query),
    enabled: open && hasBridge(),
    // Keep the previous list while the next keystroke's query is in flight —
    // an empty flash per keypress reads as flicker.
    placeholderData: keepPreviousData,
  })
  const entries = buildAutocompleteEntries(query, data ?? [])

  const insertLink = (target: string): void => {
    const view = editor.view
    view.dispatch(view.state.tr.insertText(`[[${target}]]`))
    view.focus()
  }

  return (
    <AutocompleteRoot
      editor={editor}
      regex={WIKI_TRIGGER}
      filter={null} // ranking is the index's job; the popup must not re-filter
      onQueryChange={(event) => setQuery(event.detail)}
      onOpenChange={(event) => setOpen(event.detail)}
    >
      <AutocompletePositioner>
        <AutocompletePopup className="reflect-autocomplete">
          {entries.map((entry) =>
            entry.kind === 'suggestion' ? (
              <AutocompleteItem
                key={entry.suggestion.path ?? `daily:${entry.suggestion.date}`}
                value={entry.suggestion.path ?? `daily:${entry.suggestion.date}`}
                className="reflect-autocomplete-item"
                onSelect={() => insertLink(entry.suggestion.target)}
              >
                <span className="reflect-autocomplete-title">
                  {entry.suggestion.date !== null
                    ? formatDayLabel(entry.suggestion.date)
                    : entry.suggestion.title}
                </span>
                {entry.suggestion.alias !== null ? (
                  <span className="reflect-autocomplete-detail">
                    {entry.suggestion.alias} → {entry.suggestion.title}
                  </span>
                ) : null}
                {entry.suggestion.date !== null ? (
                  <span className="reflect-autocomplete-detail">
                    {entry.suggestion.path === null
                      ? `${entry.suggestion.date} · new`
                      : entry.suggestion.date}
                  </span>
                ) : null}
              </AutocompleteItem>
            ) : (
              <AutocompleteItem
                key="__create__"
                value="__create__"
                className="reflect-autocomplete-item"
                onSelect={() => {
                  void (async () => {
                    try {
                      await onCreate?.(entry.title)
                    } catch (err) {
                      console.error('create-from-autocomplete failed:', err)
                    }
                    insertLink(entry.title)
                  })()
                }}
              >
                <span className="reflect-autocomplete-title">Create “{entry.title}”</span>
              </AutocompleteItem>
            ),
          )}
          <AutocompleteEmpty className="reflect-autocomplete-empty">
            No matching notes
          </AutocompleteEmpty>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
