import { ulid } from 'ulidx'
import { notePath, writeNote } from '@reflect/core'

/**
 * Create a new note titled `title` (Plan 07's create-from-unresolved): a ULID
 * filename (Plan 02 — path identity is opaque; the title lives in content as
 * the first heading, where the indexer derives it from). Returns the new path.
 * The write carries `generation`, so a create racing a graph switch is
 * rejected loudly instead of landing in the wrong graph.
 */
export async function createNoteWithTitle(title: string, generation: number): Promise<string> {
  const path = notePath(ulid().toLowerCase())
  await writeNote(path, `# ${title.trim()}\n`, generation)
  return path
}
