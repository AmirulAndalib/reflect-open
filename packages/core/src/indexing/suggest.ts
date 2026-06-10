/**
 * Pure ranking for `[[` autocomplete (Plan 07): merges title and alias matches
 * from the index into one ordered candidate list. The SQL layer (`queries.ts`)
 * only guarantees "contains the query somewhere"; the ordering policy — exact
 * before prefix before substring, titles before aliases, recent before stale —
 * lives here where it can be unit-tested without a database.
 */

/** A `[[` autocomplete candidate. */
export interface WikiSuggestion {
  /** What `[[…]]` should contain when chosen (the canonical title, or an ISO date). */
  target: string
  /** The note it resolves to — `null` for a daily whose file doesn't exist yet. */
  path: string | null
  /** Display title (for dailies this is the ISO date; hosts format it). */
  title: string
  /** Set when the match came in via an alias (display as "alias → title"). */
  alias: string | null
  /** Set on daily-note suggestions. */
  date: string | null
}

/** One `notes` row considered for suggestion (a title match or recency fill). */
export interface TitleCandidate {
  path: string
  title: string
  titleKey: string
  dailyDate: string | null
  mtime: number
}

/** One `aliases ⋈ notes` row (an alias match). */
export interface AliasCandidate extends TitleCandidate {
  alias: string
  aliasKey: string
}

/** Lower ranks first: exact (0) < prefix (1) < substring (2); 3 = recency fill. */
function matchRank(key: string, candidateKey: string): number {
  if (key === '') {
    return 3
  }
  if (candidateKey === key) {
    return 0
  }
  return candidateKey.startsWith(key) ? 1 : 2
}

interface Scored {
  suggestion: WikiSuggestion
  score: number
  mtime: number
}

/**
 * Merge and order candidates for `key` (the case-folded query). Alias hits
 * rank just behind the equivalent title hit, ties break on file recency, and a
 * note appears once — its best-scoring entry wins (so a note whose title *and*
 * alias both match shows as the plain title row).
 */
export function rankWikiSuggestions(
  key: string,
  titles: TitleCandidate[],
  aliases: AliasCandidate[],
  limit: number,
): WikiSuggestion[] {
  const scored: Scored[] = [
    ...titles.map((row) => ({
      suggestion: {
        target: row.dailyDate ?? row.title,
        path: row.path,
        title: row.title,
        alias: null,
        date: row.dailyDate,
      },
      // ×2 leaves room for the alias penalty between match ranks.
      score: matchRank(key, row.titleKey) * 2,
      mtime: row.mtime,
    })),
    ...aliases.map((row) => ({
      suggestion: {
        target: row.dailyDate ?? row.title,
        path: row.path,
        title: row.title,
        alias: row.alias,
        date: row.dailyDate,
      },
      score: matchRank(key, row.aliasKey) * 2 + 1,
      mtime: row.mtime,
    })),
  ]

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      b.mtime - a.mtime ||
      a.suggestion.title.localeCompare(b.suggestion.title),
  )

  const seen = new Set<string>()
  const result: WikiSuggestion[] = []
  for (const { suggestion } of scored) {
    if (suggestion.path !== null && seen.has(suggestion.path)) {
      continue
    }
    if (suggestion.path !== null) {
      seen.add(suggestion.path)
    }
    result.push(suggestion)
    if (result.length >= limit) {
      break
    }
  }
  return result
}
