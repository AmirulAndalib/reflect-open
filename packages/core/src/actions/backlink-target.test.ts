import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readNote } from '../graph/commands'
import { resolveOrCreateNoteWithTitle } from '../graph/create-note'
import { ensureBacklinkTarget } from './backlink-target'

vi.mock('../graph/commands', () => ({ readNote: vi.fn() }))
vi.mock('../graph/create-note', () => ({ resolveOrCreateNoteWithTitle: vi.fn() }))

const readNoteMock = vi.mocked(readNote)
const resolveOrCreateMock = vi.mocked(resolveOrCreateNoteWithTitle)

beforeEach(() => {
  vi.clearAllMocks()
  resolveOrCreateMock.mockResolvedValue({ kind: 'resolved', path: 'notes/links.md' })
  readNoteMock.mockResolvedValue('# Links\n')
})

describe('ensureBacklinkTarget', () => {
  it('returns the existing note title so renamed categories keep one section', async () => {
    resolveOrCreateMock.mockResolvedValue({ kind: 'resolved', path: 'notes/bookmarks.md' })
    readNoteMock.mockResolvedValue('# Bookmarks\n')

    await expect(ensureBacklinkTarget('Links', 3)).resolves.toBe('Bookmarks')
    expect(readNoteMock).toHaveBeenCalledWith('notes/bookmarks.md', 3)
  })

  it('returns the canonical title of a newly created target', async () => {
    resolveOrCreateMock.mockResolvedValue({ kind: 'created', path: 'notes/links.md' })

    await expect(ensureBacklinkTarget('Links', 3)).resolves.toBe('Links')
  })

  it('keeps the resolvable alias when the current title is unsafe in wiki syntax', async () => {
    resolveOrCreateMock.mockResolvedValue({ kind: 'resolved', path: 'notes/saved-links.md' })
    readNoteMock.mockResolvedValue('# Saved | Links\n')

    await expect(ensureBacklinkTarget('Links', 3)).resolves.toBe('Links')
  })

  it('refuses an ambiguous target instead of creating a terminal unresolved backlink', async () => {
    resolveOrCreateMock.mockResolvedValue({
      kind: 'ambiguous',
      paths: ['notes/links-2.md', 'notes/links.md'],
    })

    await expect(ensureBacklinkTarget('Links', 3)).rejects.toMatchObject({
      kind: 'unknown',
      message: expect.stringContaining('matches multiple notes'),
    })
    expect(readNoteMock).not.toHaveBeenCalled()
  })
})
