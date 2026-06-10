import { isAppError, isPinned, parseNote, readNote, upsertFrontmatter, writeNote } from '@reflect/core'
import { openSession } from '@/editor/open-documents'

/**
 * Toggle a note's `pinned` frontmatter flag. Markdown is the source of truth:
 * the flag lands in the file, the watcher re-indexes it, and the sidebar's
 * Pinned section follows from the index — no UI-side pin state. Toggling off
 * always clears any explicit `pinned: <order>`; toggling on writes a bare
 * `pinned: true` (the reorder UI, when it lands, is what writes orders).
 *
 * Routes through the live session whenever the note is open (the same liveness
 * contract as the rename coordinator's alias placement): a direct disk write
 * under a dirty buffer would park a conflict caused by our own action, and
 * "keep mine" would silently undo the pin. The session's `commitFrontmatter`
 * owns making the patch land immediately — parked-conflict handling included.
 * With no live session (or one that can't take patches), a read-patch-write on
 * disk is reconciled by any loading/clean session like an external change.
 *
 * Returns the note's new pinned state.
 */
export async function toggleNotePinned(path: string, generation: number): Promise<boolean> {
  const owner = openSession(path)
  if (owner !== null) {
    const pinned = !isPinned(parseNote({ path, source: owner.content() }).frontmatter)
    if (await owner.commitFrontmatter({ pinned })) {
      return pinned
    }
  }
  const content = await readNoteOrEmpty(path)
  const pinned = !isPinned(parseNote({ path, source: content }).frontmatter)
  const patched = upsertFrontmatter(content, { pinned: pinned ? true : undefined })
  if (patched !== content) {
    await writeNote(path, patched, generation)
  }
  return pinned
}

/**
 * The note's content, where a missing file reads as an empty note — the lazy
 * contract: dailies (and ⌘N notes) are valid pin targets before their file
 * exists, and the pin write is what creates the file. Covers the gap where the
 * pane's session exists but can't take patches yet (still loading) — its
 * post-load reconcile then adopts our write like any external change.
 */
async function readNoteOrEmpty(path: string): Promise<string> {
  try {
    return await readNote(path)
  } catch (cause) {
    if (isAppError(cause) && cause.kind === 'notFound') {
      return ''
    }
    throw cause
  }
}
