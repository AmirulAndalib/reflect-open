import { parseBody } from './grammar'

/**
 * Inline wiki-link scanning for the editor (Plan 05). The editor decorates
 * `[[wiki links]]` inside rendered text blocks; this scanner reuses the **one
 * canonical Lezer grammar** (`wikiLinkExtension`, shared with the indexer) so
 * the editor's chips and the index's links can never disagree on what counts
 * as a wiki link — including code contexts: a `[[target]]` inside a code span
 * is not a link in either world.
 */

/** One `[[target]]` / `[[target|alias]]` occurrence within a scanned text. */
export interface InlineWikiLink {
  /** Span of the whole `[[…]]`, offsets relative to the scanned text. */
  from: number
  to: number
  target: string
  alias: string | null
  /** Span of the display text (the alias when present, else the target). */
  displayFrom: number
  displayTo: number
}

/**
 * Find every wiki link in a block's text content. Offsets are relative to the
 * input string; the caller maps them into document positions.
 */
export function scanInlineWikiLinks(text: string): InlineWikiLink[] {
  if (!text.includes('[[')) {
    return [] // cheap pre-filter — most blocks have no wiki links
  }
  const links: InlineWikiLink[] = []
  parseBody(text).iterate({
    enter: (node) => {
      if (node.name !== 'WikiLink') {
        return true
      }
      const { from, to } = node
      const inner = text.slice(from + 2, to - 2)
      const pipe = inner.indexOf('|')
      const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
      const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null
      // Display text: the alias segment when aliased, else the target segment.
      const displayFrom = pipe === -1 ? from + 2 : from + 2 + pipe + 1
      const displayTo = to - 2
      links.push({ from, to, target, alias, displayFrom, displayTo })
      return false
    },
  })
  return links
}
