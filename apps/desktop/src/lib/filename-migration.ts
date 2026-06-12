import {
  detectConflictMarkers,
  errorMessage,
  getConflictedNotes,
  gitCommitAll,
  gitStatus,
  hasAuthoredTitle,
  listNotes,
  parseNote,
  readNote,
  slugPathForTitle,
  upsertFrontmatter,
  writeNote,
} from '@reflect/core'
import { moveNoteCarryingSession } from '@/editor/move-note'
import { openSession } from '@/editor/open-documents'
import { newNoteId } from './create-note'
import { startOperation } from './operations'

/**
 * The one-time ULID→slug migration (Plan 17c): existing `notes/<ulid>.md`
 * files adopt their title's slug name and gain the frontmatter `id:` ULID
 * that new notes are born with. Idempotent and resumable — each file is
 * independently done-or-not, so an interrupted run just leaves fewer
 * candidates for the next one.
 */

/** A lowercase-ULID basename under `notes/` — the pre-Plan-17 filename shape. */
const ULID_NOTE_RE = /^notes\/[0-9a-hjkmnp-tv-z]{26}\.md$/

/** A note file the migration would rename. */
export interface MigrationCandidate {
  path: string
  title: string
}

/**
 * Every indexed ULID-named note the migration would actually rename, so the
 * prompt's count is a promise, not an estimate. Excluded up front (not
 * silently skipped mid-run): untitled notes (their index title falls back to
 * the ULID stem — nothing readable to rename to; they convert later via the
 * birth path), notes awaiting sync-conflict review (their content — and so
 * their title — is contested), and notes open in a pane right now (their
 * session owns the buffer; the next graph open offers them again).
 */
export async function findMigrationCandidates(): Promise<MigrationCandidate[]> {
  const [entries, conflicted] = await Promise.all([listNotes({ tag: null }), getConflictedNotes()])
  const contested = new Set(conflicted.map((note) => note.path))
  return entries
    .filter((entry) => ULID_NOTE_RE.test(entry.path))
    .filter((entry) => !entry.path.endsWith(`/${entry.title}.md`))
    .filter((entry) => !contested.has(entry.path))
    .filter((entry) => openSession(entry.path) === null)
    .map((entry) => ({ path: entry.path, title: entry.title }))
}

export interface MigrationResult {
  moved: number
  /** Candidates skipped this run (open in a pane, conflicted, or untitled now). */
  skipped: number
  /** Candidates that errored, with the messages (the run continues past them). */
  failed: Array<{ path: string; message: string }>
}

export interface MigrateOptions {
  candidates: MigrationCandidate[]
  /** The graph write generation (`GraphInfo.generation`). */
  generation: number
  onProgress?: (done: number, total: number) => void
}

/**
 * Run the migration over `candidates`: per file — stamp `id:` frontmatter if
 * missing (preserving the header bytes exactly), derive the slug target from
 * the *current* content's title, and move file + projection in one Rust
 * transaction. Conservative skips, never failures: a note open in a pane
 * (its session owns the buffer), one carrying conflict markers (its content
 * is contested), or one whose title vanished since indexing.
 */
export async function migrateUlidNotes(options: MigrateOptions): Promise<MigrationResult> {
  const { candidates, generation, onProgress } = options
  const result: MigrationResult = { moved: 0, skipped: 0, failed: [] }
  let done = 0
  for (const candidate of candidates) {
    try {
      if (openSession(candidate.path) !== null) {
        // A live session owns this buffer; stamping `id:` under it would race
        // the editor. Rare (the prompt fires on graph open) — next run's job.
        result.skipped += 1
        continue
      }
      let content = await readNote(candidate.path)
      if (detectConflictMarkers(content)) {
        result.skipped += 1
        continue
      }
      const parsed = parseNote({ path: candidate.path, source: content })
      if (!hasAuthoredTitle(parsed)) {
        result.skipped += 1
        continue
      }
      if (parsed.frontmatter.id === undefined) {
        content = upsertFrontmatter(content, { id: newNoteId() })
        await writeNote(candidate.path, content, generation)
      }
      const target = await slugPathForTitle(candidate.path, parsed.title)
      if (target !== candidate.path) {
        await moveNoteCarryingSession(candidate.path, target, generation)
      }
      result.moved += 1
    } catch (cause) {
      // errorMessage, not String(cause): Tauri IPC errors are plain
      // `{ kind, message }` objects, which stringify to "[object Object]".
      result.failed.push({ path: candidate.path, message: errorMessage(cause) })
    } finally {
      done += 1
      onProgress?.(done, candidates.length)
    }
  }
  return result
}

export interface RunMigrationOptions {
  candidates: MigrationCandidate[]
  /** The graph write generation (`GraphInfo.generation`). */
  generation: number
}

/**
 * The accept path of the readable-filenames offer (Plan 17c): checkpoint,
 * migrate, and report through the operations status — so the prompt
 * component stays pure UI. With a repo, the whole rename pass is one commit
 * away from undoable; a graph without git has no checkpoint to take — the
 * user's standing choice, proceed. A repo that exists but can't commit
 * aborts the run: renaming without the safety net is not our call to make.
 */
export async function runFilenameMigration(options: RunMigrationOptions): Promise<void> {
  const { candidates, generation } = options
  const count = candidates.length
  const operation = startOperation(
    `Renaming ${count} ${count === 1 ? 'note' : 'notes'} to readable filenames`,
  )
  try {
    const status = await gitStatus(generation)
    if (status.initialized) {
      await gitCommitAll('Checkpoint before readable filenames', generation)
    }
  } catch (cause) {
    console.error('readable-filenames checkpoint failed:', cause)
    operation.fail('the pre-rename checkpoint commit failed; nothing was renamed')
    return
  }
  const result = await migrateUlidNotes({
    candidates,
    generation,
    onProgress: operation.progress,
  })
  if (result.failed.length > 0) {
    console.error('readable-filenames migration failures:', result.failed)
    const skippedToo =
      result.skipped > 0
        ? `; ${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} skipped (opened or edited mid-run)`
        : ''
    operation.fail(
      `renamed ${result.moved} of ${count} — ${result.failed.length} failed and keep their old filenames${skippedToo}; reopening the graph offers the rest again`,
    )
  } else if (result.skipped > 0) {
    // Not an error — the scan excludes open/conflicted notes up front, so a
    // skip here is a mid-run race — but the prompt promised `count` renames,
    // and a partial completion must say so rather than read as done.
    operation.notice(
      `renamed ${result.moved} of ${count} — ${result.skipped} ${result.skipped === 1 ? 'was' : 'were'} skipped (opened or edited mid-run); reopening the graph offers ${result.skipped === 1 ? 'it' : 'them'} again`,
    )
  } else {
    operation.done()
  }
}
