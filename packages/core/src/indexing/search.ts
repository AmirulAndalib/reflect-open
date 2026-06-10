import { sql } from 'kysely'
import { db } from './db'
import { buildFtsMatch } from './search-query'

/**
 * Ranked full-text search for the command palette (Plan 08): FTS5 over
 * title + body with a strong title boost (bm25 column weights), returning a
 * body snippet windowed around the first match. Highlight boundaries use
 * control-character markers so {@link parseHighlights} can split them without
 * ever confusing user text for markup.
 */

/** Marks the start/end of a highlighted match inside a snippet. */
export const HIGHLIGHT_START = '\u0001'
export const HIGHLIGHT_END = '\u0002'

export interface RankedSearchHit {
  path: string
  title: string
  /** Body snippet with HIGHLIGHT_START/END around matches. */
  snippet: string
}

/** One run of snippet text, highlighted or plain. */
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

/**
 * Search title + body, best first. Title hits rank far above body hits
 * (bm25 weights path 0 / title 10 / body 1 — lower scores are better in
 * SQLite's bm25, so weights scale each column's contribution).
 */
export async function searchNotesRanked(query: string, limit = 12): Promise<RankedSearchHit[]> {
  const match = buildFtsMatch(query)
  if (match === null) {
    return []
  }
  const result = await sql<RankedSearchHit>`
    SELECT path, title,
      snippet(search_fts, 2, ${HIGHLIGHT_START}, ${HIGHLIGHT_END}, '…', 10) AS snippet
    FROM search_fts
    WHERE search_fts MATCH ${match}
    ORDER BY bm25(search_fts, 0, 10.0, 1.0)
    LIMIT ${limit}
  `.execute(db)
  return result.rows
}

/** A uniformly random note path, or null on an empty graph (Plan 08 command). */
export async function randomNotePath(): Promise<string | null> {
  const result = await sql<{ path: string }>`
    SELECT path FROM notes ORDER BY random() LIMIT 1
  `.execute(db)
  return result.rows[0]?.path ?? null
}
