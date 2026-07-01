import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContactMatch } from '@reflect/core'
import type { NoteSession } from '@/editor/note-session'

const readNote = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>())
const writeNote = vi.hoisted(() => vi.fn(async () => {}))
const openSession = vi.hoisted(() => vi.fn<(path: string) => NoteSession | null>(() => null))

vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  readNote,
  writeNote,
}))
vi.mock('@/editor/open-documents', () => ({ openSession }))

const { addContactToNote, ignoreContactSuggestion } = await import('./note-contact')

const ADA: ContactMatch = {
  fullName: 'Ada Lovelace',
  givenName: 'Ada',
  familyName: 'Lovelace',
  emails: ['ada@example.com'],
  phones: ['+1 555 0100'],
}

beforeEach(() => {
  readNote.mockReset()
  writeNote.mockClear()
  openSession.mockReset()
  openSession.mockReturnValue(null)
})

function fakeSession(content: string, { canAppend = true, canCommit = true } = {}) {
  const commitBodyAppend = vi.fn(async () => canAppend)
  const commitFrontmatter = vi.fn(async () => canCommit)
  const session = {
    content: () => content,
    liveContent: () => content,
    commitBodyAppend,
    commitFrontmatter,
  } as unknown as NoteSession
  return { session, commitBodyAppend, commitFrontmatter }
}

describe('addContactToNote', () => {
  it('appends the details and marks `added` through the live session', async () => {
    const { session, commitBodyAppend, commitFrontmatter } = fakeSession('# Ada Lovelace\n')
    openSession.mockReturnValue(session)

    await addContactToNote('notes/Ada Lovelace.md', ADA, 3)

    expect(commitBodyAppend).toHaveBeenCalledWith(
      '- Email: ada@example.com\n- Phone: +1 555 0100',
    )
    expect(commitFrontmatter).toHaveBeenCalledWith({ contactSuggestion: 'added' })
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('refuses rather than clobber when the open session cannot take the append', async () => {
    const { session, commitFrontmatter } = fakeSession('# Ada Lovelace\n', { canAppend: false })
    openSession.mockReturnValue(session)

    await expect(addContactToNote('notes/Ada Lovelace.md', ADA, 3)).rejects.toThrow(
      /can’t be updated right now/,
    )
    expect(commitFrontmatter).not.toHaveBeenCalled()
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('patches a closed note on disk: details block plus the frontmatter mark', async () => {
    readNote.mockResolvedValue('# Ada Lovelace\n')

    await addContactToNote('notes/Ada Lovelace.md', ADA, 3)

    expect(writeNote).toHaveBeenNthCalledWith(
      1,
      'notes/Ada Lovelace.md',
      '# Ada Lovelace\n\n- Email: ada@example.com\n- Phone: +1 555 0100\n',
      3,
    )
    expect(writeNote).toHaveBeenNthCalledWith(
      2,
      'notes/Ada Lovelace.md',
      expect.stringContaining('contactSuggestion: added'),
      3,
    )
  })

  it('writes only the mark for a contact with no details', async () => {
    const bare: ContactMatch = { ...ADA, emails: [], phones: [] }
    readNote.mockResolvedValue('# Ada Lovelace\n')

    await addContactToNote('notes/Ada Lovelace.md', bare, 3)

    expect(writeNote).toHaveBeenCalledTimes(1)
    expect(writeNote).toHaveBeenCalledWith(
      'notes/Ada Lovelace.md',
      '---\ncontactSuggestion: added\n---\n# Ada Lovelace\n',
      3,
    )
  })
})

describe('ignoreContactSuggestion', () => {
  it('marks `ignored` through the live session and writes nothing else', async () => {
    const { session, commitBodyAppend, commitFrontmatter } = fakeSession('# Ada Lovelace\n')
    openSession.mockReturnValue(session)

    await ignoreContactSuggestion('notes/Ada Lovelace.md', 3)

    expect(commitFrontmatter).toHaveBeenCalledWith({ contactSuggestion: 'ignored' })
    expect(commitBodyAppend).not.toHaveBeenCalled()
  })

  it('marks a closed note on disk', async () => {
    readNote.mockResolvedValue('# Ada Lovelace\n')

    await ignoreContactSuggestion('notes/Ada Lovelace.md', 3)

    expect(writeNote).toHaveBeenCalledWith(
      'notes/Ada Lovelace.md',
      '---\ncontactSuggestion: ignored\n---\n# Ada Lovelace\n',
      3,
    )
  })
})
