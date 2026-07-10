import { sql } from 'kysely'
import { db } from './db'
import { splitSearchTerms } from './search-query'

/**
 * Search-highlight plumbing for indexed snippets and query-matched titles.
 * The search itself lives in `filtered-search.ts` — one ranked, snippeted
 * query whose filters may be empty, so there is exactly one search path to
 * keep correct.
 * Highlight boundaries use control-character markers so {@link parseHighlights}
 * can split them without ever confusing user text for markup.
 */

/** Marks the start/end of a highlighted match inside a snippet. */
export const HIGHLIGHT_START = '\u0001'
export const HIGHLIGHT_END = '\u0002'

/** One run of display text, highlighted or plain. */
export interface HighlightSegment {
  text: string
  highlighted: boolean
}

/** Split a marker-bearing snippet into renderable segments. */
export function parseHighlights(snippet: string): HighlightSegment[] {
  const segments: HighlightSegment[] = []
  let rest = snippet
  let highlighted = false
  while (rest !== '') {
    // Alternate between looking for the opening and closing marker.
    const at = rest.indexOf(highlighted ? HIGHLIGHT_END : HIGHLIGHT_START)
    if (at === -1) {
      segments.push({ text: rest, highlighted })
      break
    }
    if (at > 0) {
      segments.push({ text: rest.slice(0, at), highlighted })
    }
    rest = rest.slice(at + 1)
    highlighted = !highlighted
  }
  return segments
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightLiterals(text: string, literals: string[]): HighlightSegment[] {
  const alternatives = [...literals]
    .sort((first, second) => second.length - first.length)
    .map(escapeRegExp)
  const matcher = new RegExp(alternatives.join('|'), 'giu')
  const segments: HighlightSegment[] = []
  let previousEnd = 0

  for (const match of text.matchAll(matcher)) {
    const start = match.index
    if (start > previousEnd) {
      segments.push({ text: text.slice(previousEnd, start), highlighted: false })
    }
    segments.push({ text: match[0], highlighted: true })
    previousEnd = start + match[0].length
  }

  if (previousEnd < text.length) {
    segments.push({ text: text.slice(previousEnd), highlighted: false })
  }
  return segments
}

/**
 * Split plain text into case-insensitive query-match runs. A contiguous
 * multi-term phrase wins when present; otherwise each term is highlighted,
 * matching the result-title treatment in Reflect's original search UI.
 */
export function highlightSearchText(text: string, query: string): HighlightSegment[] {
  if (text === '') {
    return []
  }
  const terms = splitSearchTerms(query)
  if (terms.length === 0) {
    return [{ text, highlighted: false }]
  }

  if (terms.length > 1) {
    const phraseSegments = highlightLiterals(text, [terms.join(' ')])
    if (phraseSegments.some((segment) => segment.highlighted)) {
      return phraseSegments
    }
  }
  return highlightLiterals(text, terms)
}

/** A uniformly random note path, or null on an empty graph (Plan 08 command). */
export async function randomNotePath(): Promise<string | null> {
  const result = await sql<{ path: string }>`
    SELECT path FROM notes ORDER BY random() LIMIT 1
  `.execute(db)
  return result.rows[0]?.path ?? null
}
