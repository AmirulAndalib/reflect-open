import type { Database } from '@reflect/db'
import { sql, type Selectable } from 'kysely'
import { readNote } from '../graph/commands'
import { db } from './db'
import { lineAt } from './snippet'

export type Backlink = Pick<
  Selectable<Database['backlinks']>,
  'sourcePath' | 'targetRaw' | 'alias' | 'posFrom' | 'posTo'
>

/** Notes that link to `path` (resolved at query time via the `backlinks` view). */
export function getBacklinks(path: string): Promise<Backlink[]> {
  return db
    .selectFrom('backlinks')
    .where('targetPath', '=', path)
    .select(['sourcePath', 'targetRaw', 'alias', 'posFrom', 'posTo'])
    .orderBy('sourcePath')
    .execute()
}

/** One backlink with the context the panel renders (Plan 07). */
export interface BacklinkContext {
  sourcePath: string
  sourceTitle: string
  /**
   * The whole source line containing the link, as rich-text-renderable Markdown
   * (empty when the file is unreadable). Not windowed: a half-cut Markdown token
   * would garble the rendered snippet, so the panel clamps the line visually.
   */
  snippet: string
  posFrom: number
}

/**
 * Backlinks of `path` with source titles and line snippets. One read per
 * distinct source; a source that vanished between query and read keeps its row
 * with an empty snippet (the index lags deletes only briefly).
 */
export async function getBacklinksWithContext(path: string): Promise<BacklinkContext[]> {
  const rows = await db
    .selectFrom('backlinks')
    .innerJoin('notes', 'notes.path', 'backlinks.sourcePath')
    .where('targetPath', '=', path)
    .select(['backlinks.sourcePath', 'backlinks.posFrom', 'notes.title as sourceTitle'])
    .$narrowType<{ sourcePath: string; posFrom: number }>()
    .orderBy(
      sql`coalesce(strftime('%s', "notes"."daily_date") * 1000, "notes"."updated_at")`,
      'desc',
    )
    .orderBy('backlinks.sourcePath')
    .orderBy('backlinks.posFrom')
    .execute()

  const contents = new Map<string, string | null>()
  await Promise.all(
    [...new Set(rows.map((row) => row.sourcePath))].map(async (sourcePath) => {
      try {
        contents.set(sourcePath, await readNote(sourcePath))
      } catch {
        contents.set(sourcePath, null)
      }
    }),
  )

  return rows.map((row) => {
    const content = contents.get(row.sourcePath)
    return {
      sourcePath: row.sourcePath,
      sourceTitle: row.sourceTitle,
      snippet: content == null ? '' : lineAt(content, row.posFrom),
      posFrom: row.posFrom,
    }
  })
}
