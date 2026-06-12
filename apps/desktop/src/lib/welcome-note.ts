import { listFiles, notePath, slugForTitle, upsertFrontmatter, writeNote } from '@reflect/core'
import { newNoteId } from '@/lib/create-note'

/**
 * The first-run seed (Plan 15 step 1): a brand-new graph gets one short,
 * pinned "How to use Reflect" note. It doubles as the optional-setup surface —
 * backup and AI keys are pointers into Settings, not a wizard — so onboarding
 * never gates the editor and "skipping" is just not reading the note.
 */

const WELCOME_TITLE = 'How to use Reflect'

/** Title-derived slug path, same birth rules as any titled note. */
export const WELCOME_NOTE_PATH = notePath(slugForTitle(WELCOME_TITLE))

const WELCOME_BODY = `# ${WELCOME_TITLE}

Reflect is a daily notebook: press ⌘D any time to land on today's note and write.

- **Link as you think.** Type \`[[\` and a title — [[Wiki Links]] connect notes. There are no folders.
- **Find anything.** ⌘K searches your whole graph; ⌘/ lists every shortcut.
- **Your files.** Every note is a markdown file in this folder, portable forever.

When you want more, open Settings (⌘,):

- **Backup** — free, private backup of your graph to GitHub.
- **AI providers** — add your own API key to chat with your notes (⌘J). Notes marked private never leave this device.

This note is pinned to the sidebar — unpin it (⌘O) when you're done.
`

/**
 * Seed the welcome note into an **empty** graph (no markdown under `daily/`
 * or `notes/`). A graph with any note at all is someone's existing data —
 * never write into it. Returns whether a seed happened.
 */
export async function seedWelcomeNote(generation: number): Promise<boolean> {
  const files = await listFiles(generation)
  if (files.length > 0) {
    return false
  }
  const source = upsertFrontmatter(WELCOME_BODY, { id: newNoteId(), pinned: true })
  await writeNote(WELCOME_NOTE_PATH, source, generation)
  return true
}
