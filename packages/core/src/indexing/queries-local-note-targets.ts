import { foldFallbackTitleKey } from '../markdown'
import { db, type IndexDatabase } from './db'

/** Every indexed note matching either exact path key, sorted and deduplicated. */
export async function findExactNotePathMatches(
  pathKeys: readonly string[],
  database: IndexDatabase = db,
): Promise<readonly string[]> {
  const keys = [...new Set(pathKeys.filter((key) => key !== ''))]
  if (keys.length === 0) {
    return []
  }
  const rows = await database
    .selectFrom('notes')
    .where('pathKey', 'in', keys)
    .select('path')
    .distinct()
    .orderBy('path')
    .execute()
  return rows.map((row) => row.path)
}

/** Leading-emoji compatibility candidates, consulted only after normal tiers miss. */
export interface WikiTargetFallbackTiers {
  readonly title: readonly string[]
  readonly alias: readonly string[]
}

/**
 * Find indexed authored titles and aliases that become equal only after the
 * conservative leading-emoji fold. This is intentionally a last-chance
 * compatibility query: callers must exhaust date, authored title, alias, and
 * basename matches first, and must not pick an ambiguous result.
 */
export async function findWikiTargetFallbackTiers(
  target: string,
  database: IndexDatabase = db,
): Promise<WikiTargetFallbackTiers> {
  const fallbackKey = foldFallbackTitleKey(target)
  if (fallbackKey === '') {
    return { title: [], alias: [] }
  }

  const [titleRows, aliasRows] = await Promise.all([
    database
      .selectFrom('notes')
      .where('authoredTitleKey', 'is not', null)
      .where('kind', '!=', 'template')
      .select(['path', 'title'])
      .orderBy('path')
      .execute(),
    database
      .selectFrom('aliases')
      .innerJoin('notes', 'notes.path', 'aliases.notePath')
      .where('notes.kind', '!=', 'template')
      .select(['notePath', 'alias'])
      .orderBy('notePath')
      .execute(),
  ])

  return {
    title: titleRows
      .filter((row) => foldFallbackTitleKey(row.title) === fallbackKey)
      .map((row) => row.path),
    alias: [
      ...new Set(
        aliasRows
          .filter((row) => foldFallbackTitleKey(row.alias) === fallbackKey)
          .map((row) => row.notePath),
      ),
    ],
  }
}
