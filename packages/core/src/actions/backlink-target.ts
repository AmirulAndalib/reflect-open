import { ReflectError } from '../errors'
import { readNote } from '../graph/commands'
import { resolveOrCreateNoteWithTitle } from '../graph/create-note'
import { wikiLinkSafe } from '../markdown/edit'
import { parseNote } from '../markdown/extract'

/**
 * Resolve the note targeted by an automatic backlink, or create it safely.
 * Ambiguity is not success: callers cannot make a durable category link until
 * the index or synced files identify one target unambiguously. Returns the
 * a link-safe current title so renames keep one section; an unsafe title falls
 * back to the requested spelling that just resolved as its alias.
 */
export async function ensureBacklinkTarget(title: string, generation: number): Promise<string> {
  const outcome = await resolveOrCreateNoteWithTitle(title, generation)
  if (outcome.kind === 'ambiguous') {
    throw new ReflectError(
      'unknown',
      `The [[${title}]] backlink matches multiple notes: ${outcome.paths.join(', ')}`,
    )
  }
  const source = await readNote(outcome.path, generation)
  const currentTitle = parseNote({ path: outcome.path, source }).title
  return wikiLinkSafe(currentTitle) === currentTitle ? currentTitle : title
}
