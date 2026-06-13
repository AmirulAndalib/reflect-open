import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noteExists, writeNote } from '../graph/commands'
import { importReflectMarkdownZip } from './v1-markdown'

vi.mock('../graph/commands', () => ({
  noteExists: vi.fn(),
  writeNote: vi.fn(),
}))

interface WrittenNote {
  readonly path: string
  readonly contents: string
  readonly generation: number
}

const noteExistsMock = vi.mocked(noteExists)
const writeNoteMock = vi.mocked(writeNote)

let existingPaths: Set<string>
let written: WrittenNote[]

beforeEach(() => {
  existingPaths = new Set()
  written = []
  noteExistsMock.mockImplementation(async (path) => existingPaths.has(path))
  writeNoteMock.mockImplementation(async (path, contents, generation) => {
    written.push({ path, contents, generation })
  })
})

function markdownZip(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([archivePath, contents]) => [archivePath, strToU8(contents)]),
    ),
  )
}

describe('importReflectMarkdownZip', () => {
  it('imports regular notes with V1 ids and normalized task markers', async () => {
    const result = await importReflectMarkdownZip(
      markdownZip({
        'A note-link-oR5K2Q.md': '# A note\n\n+ [x] Done',
      }),
      { generation: 42 },
    )

    expect(result).toEqual({ imported: 1, regular: 1, daily: 0, skipped: 0, renamed: 0 })
    expect(written).toEqual([
      {
        path: 'notes/a-note.md',
        contents: '---\nid: link-oR5K2Q\n---\n# A note\n\n- [x] Done\n',
        generation: 42,
      },
    ])
  })

  it('uses the daily heading date when old exports wrote the wrong filename date', async () => {
    const result = await importReflectMarkdownZip(
      markdownZip({
        'daily-notes/2026-02-05.md': '# Fri, February 6th, 2026\n\n+ [ ] Today',
      }),
      { generation: 7 },
    )

    expect(result).toEqual({ imported: 1, regular: 0, daily: 1, skipped: 0, renamed: 0 })
    expect(written).toEqual([
      {
        path: 'daily/2026-02-06.md',
        contents: '- [ ] Today\n',
        generation: 7,
      },
    ])
  })

  it('suffixes regular note paths that already exist', async () => {
    existingPaths.add('notes/meeting.md')

    const result = await importReflectMarkdownZip(
      markdownZip({
        'Meeting-abc123.md': '# Meeting\n\nNotes',
      }),
      { generation: 3 },
    )

    expect(result).toEqual({ imported: 1, regular: 1, daily: 0, skipped: 0, renamed: 1 })
    expect(written[0]?.path).toBe('notes/meeting-2.md')
  })

  it('keeps colliding daily notes by importing them as regular notes', async () => {
    existingPaths.add('daily/2026-06-13.md')

    const result = await importReflectMarkdownZip(
      markdownZip({
        'daily-notes/2026-06-13.md': '# Sat, June 13th, 2026\n\nAlready have today',
      }),
      { generation: 3 },
    )

    expect(result).toEqual({ imported: 1, regular: 1, daily: 0, skipped: 0, renamed: 1 })
    expect(written).toEqual([
      {
        path: 'notes/daily-2026-06-13.md',
        contents: '# Daily 2026-06-13\n\nAlready have today\n',
        generation: 3,
      },
    ])
  })

  it('ignores non-markdown archive entries and macOS resource fork entries', async () => {
    const result = await importReflectMarkdownZip(
      markdownZip({
        'A.md': '# A',
        'assets/image.png': 'not really png',
        '__MACOSX/._A.md': 'resource fork',
      }),
      { generation: 9 },
    )

    expect(result).toEqual({ imported: 1, regular: 1, daily: 0, skipped: 0, renamed: 0 })
    expect(written).toHaveLength(1)
  })

  it('skips malformed daily-note dates instead of writing an unsafe path', async () => {
    const result = await importReflectMarkdownZip(
      markdownZip({
        'daily-notes/2026-02-31.md': '# Notes\n\nImpossible date',
      }),
      { generation: 9 },
    )

    expect(result).toEqual({ imported: 0, regular: 0, daily: 0, skipped: 1, renamed: 0 })
    expect(written).toHaveLength(0)
  })
})
