import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { registerOpenDocument } from '@/editor/open-documents'
import type { NoteSession } from '@/editor/note-session'

/**
 * The 17c migration runner over a fake graph: a files map behind the bridge,
 * with `db_query` answering both the candidate list (note rows) and the
 * collision probe (path lookups) from the same map. Git commands answer from
 * a configurable `repo` state so `runFilenameMigration`'s checkpoint
 * behavior is exercised end-to-end.
 */

const operations = vi.hoisted(() => ({
  log: [] as Array<{ label: string; outcome: string; message: string | null }>,
}))
vi.mock('./operations', () => ({
  startOperation: (label: string) => {
    const record = { label, outcome: 'running', message: null as string | null }
    operations.log.push(record)
    return {
      progress: () => {},
      done: () => {
        record.outcome = 'done'
      },
      notice: (message: string) => {
        record.outcome = 'notice'
        record.message = message
      },
      fail: (message: string) => {
        record.outcome = 'failed'
        record.message = message
      },
    }
  },
}))

const { findMigrationCandidates, migrateUlidNotes, runFilenameMigration } = await import(
  './filename-migration'
)

const ULID_A = '01arz3ndektsv4rrffq69g5fav'
const ULID_B = '01brz3ndektsv4rrffq69g5fbw'

let files: Record<string, string>
let repo: { initialized: boolean; failCommit?: boolean }
let commits: string[]

function bindBridge(): void {
  setBridge({
    invoke: async (command: string, args?: Record<string, unknown>) => {
      if (command === 'git_status') {
        return {
          initialized: repo.initialized,
          branch: null,
          remoteUrl: null,
          ahead: 0,
          behind: 0,
          inProgress: false,
        }
      }
      if (command === 'git_commit_all') {
        if (repo.failCommit) {
          throw { kind: 'io', message: 'index locked' }
        }
        commits.push(String(args?.message))
        return { committed: true, sha: 'abc', ahead: 1, skippedLargeFiles: [] }
      }
      if (command === 'note_read') {
        const content = files[String(args?.path)]
        if (content === undefined) {
          throw { kind: 'notFound', message: 'missing' }
        }
        return content
      }
      if (command === 'note_write') {
        files[String(args?.path)] = String(args?.contents)
        return null
      }
      if (command === 'note_exists') {
        return files[String(args?.path)] !== undefined
      }
      if (command === 'note_move_indexed') {
        const from = String(args?.from)
        const to = String(args?.to)
        if (files[to] === undefined && files[from] !== undefined) {
          files[to] = files[from]
        }
        delete files[from]
        return null
      }
      if (command === 'db_query') {
        const sql = String(args?.sql)
        if (sql.includes('"tags"') || sql.includes('has_conflict')) {
          return []
        }
        if (sql.includes('"path" = ')) {
          // The collision probe: one path lookup.
          const candidate = String((args?.params as unknown[])[0])
          return files[candidate] !== undefined ? [{ path: candidate }] : []
        }
        // The note list: derive rows from the files map (title = H1 or stem).
        return Object.entries(files).map(([path, content]) => {
          const h1 = /^#\s+(.+)$/m.exec(content)
          const stem = path.replace(/^notes\//, '').replace(/\.md$/, '')
          return { path, title: h1?.[1] ?? stem, mtime: 0, preview: '' }
        })
      }
      return null
    },
    listen: async () => () => {},
  })
}

beforeEach(() => {
  files = {}
  repo = { initialized: false }
  commits = []
  operations.log = []
  bindBridge()
})

afterEach(() => {
  setBridge(null)
})

describe('findMigrationCandidates', () => {
  it('selects titled ULID-named notes; untitled and slug-named ones stay put', async () => {
    files[`notes/${ULID_A}.md`] = '# Real Title\n'
    files[`notes/${ULID_B}.md`] = 'no heading here\n' // untitled: title = stem
    files['notes/already-named.md'] = '# Already Named\n'

    await expect(findMigrationCandidates()).resolves.toEqual([
      { path: `notes/${ULID_A}.md`, title: 'Real Title' },
    ])
  })
})

describe('migrateUlidNotes', () => {
  it('stamps a missing id and moves the file onto its slug path', async () => {
    files[`notes/${ULID_A}.md`] = '# Real Title\n'

    const result = await migrateUlidNotes({
      candidates: [{ path: `notes/${ULID_A}.md`, title: 'Real Title' }],
      generation: 3,
    })

    expect(result).toEqual({ moved: 1, skipped: 0, failed: [] })
    expect(files[`notes/${ULID_A}.md`]).toBeUndefined()
    expect(files['notes/real-title.md']).toMatch(/^---\nid: [0-9a-z]{26}\n---\n# Real Title\n$/)
  })

  it('keeps an existing id untouched (idempotent re-run)', async () => {
    const content = '---\nid: 01existing00000000000000000\n---\n# Real Title\n'
    files[`notes/${ULID_A}.md`] = content

    await migrateUlidNotes({
      candidates: [{ path: `notes/${ULID_A}.md`, title: 'Real Title' }],
      generation: 3,
    })

    expect(files['notes/real-title.md']).toBe(content)
  })

  it('suffixes when the slug is taken', async () => {
    files['notes/real-title.md'] = '# Another Note\n'
    files[`notes/${ULID_A}.md`] = '# Real Title\n'

    await migrateUlidNotes({
      candidates: [{ path: `notes/${ULID_A}.md`, title: 'Real Title' }],
      generation: 3,
    })

    expect(files['notes/real-title-2.md']).toContain('# Real Title')
    expect(files['notes/real-title.md']).toBe('# Another Note\n') // untouched
  })

  it('skips conflicted, open, and since-untitled notes; reports progress for all', async () => {
    const conflicted = `notes/${ULID_A}.md`
    files[conflicted] = '<<<<<<< mine\n# A\n=======\n# B\n>>>>>>> theirs\n'
    const open = `notes/${ULID_B}.md`
    files[open] = '# Open Note\n'
    const session: NoteSession = {
      path: open,
      retarget: () => {},
      load: () => {},
      editorChanged: () => {},
      externalChanged: () => {},
      flush: async () => {},
      keepMine: () => {},
      loadTheirs: () => {},
      commitFrontmatter: async () => true,
      content: () => files[open],
      updateFrontmatter: () => true,
      dispose: () => {},
    }
    const unregister = registerOpenDocument({ session })
    const progress: Array<[number, number]> = []
    try {
      const result = await migrateUlidNotes({
        candidates: [
          { path: conflicted, title: 'A' },
          { path: open, title: 'Open Note' },
        ],
        generation: 3,
        onProgress: (done, total) => progress.push([done, total]),
      })
      expect(result).toEqual({ moved: 0, skipped: 2, failed: [] })
      expect(progress).toEqual([
        [1, 2],
        [2, 2],
      ])
      expect(files[conflicted]).toBeDefined() // nothing touched
      expect(files[open]).toBe('# Open Note\n')
    } finally {
      unregister()
    }
  })

  it('collects failures and keeps going', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      files[`notes/${ULID_B}.md`] = '# Survivor\n'
      const result = await migrateUlidNotes({
        candidates: [
          { path: `notes/${ULID_A}.md`, title: 'Ghost' }, // file vanished
          { path: `notes/${ULID_B}.md`, title: 'Survivor' },
        ],
        generation: 3,
      })
      expect(result.moved).toBe(1)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].path).toBe(`notes/${ULID_A}.md`)
      expect(files['notes/survivor.md']).toContain('# Survivor')
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('runFilenameMigration', () => {
  const CANDIDATE = { path: `notes/${ULID_A}.md`, title: 'Real Title' }

  it('checkpoints an initialized repo, migrates, reports done', async () => {
    repo = { initialized: true }
    files[CANDIDATE.path] = '# Real Title\n'

    await runFilenameMigration({ candidates: [CANDIDATE], generation: 3 })

    expect(commits).toEqual(['Checkpoint before readable filenames'])
    expect(files['notes/real-title.md']).toContain('# Real Title')
    expect(operations.log).toEqual([
      expect.objectContaining({
        label: 'Renaming 1 note to readable filenames',
        outcome: 'done',
      }),
    ])
  })

  it('skips the checkpoint when the graph has no repo — the standing choice', async () => {
    files[CANDIDATE.path] = '# Real Title\n'

    await runFilenameMigration({ candidates: [CANDIDATE], generation: 3 })

    expect(commits).toEqual([])
    expect(operations.log[0]?.outcome).toBe('done')
  })

  it('aborts before renaming anything when the checkpoint commit fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      repo = { initialized: true, failCommit: true }
      files[CANDIDATE.path] = '# Real Title\n'

      await runFilenameMigration({ candidates: [CANDIDATE], generation: 3 })

      expect(operations.log[0]?.outcome).toBe('failed')
      expect(operations.log[0]?.message).toContain('nothing was renamed')
      expect(files[CANDIDATE.path]).toBe('# Real Title\n') // untouched
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('a partial completion with skips is a notice, never a silent done', async () => {
    // The prompt promised the candidate count; a mid-run race (the note got
    // opened) shrinks it. Not a failure — but it must not read as complete.
    files[CANDIDATE.path] = '# Real Title\n'
    const open = `notes/${ULID_B}.md`
    files[open] = '# Open Note\n'
    const session: NoteSession = {
      path: open,
      retarget: () => {},
      load: () => {},
      editorChanged: () => {},
      externalChanged: () => {},
      flush: async () => {},
      keepMine: () => {},
      loadTheirs: () => {},
      commitFrontmatter: async () => true,
      content: () => files[open],
      updateFrontmatter: () => true,
      dispose: () => {},
    }
    const unregister = registerOpenDocument({ session })
    try {
      await runFilenameMigration({
        candidates: [CANDIDATE, { path: open, title: 'Open Note' }],
        generation: 3,
      })

      expect(operations.log[0]?.outcome).toBe('notice')
      expect(operations.log[0]?.message).toContain('renamed 1 of 2')
      expect(operations.log[0]?.message).toContain('skipped')
    } finally {
      unregister()
    }
  })

  it('summarizes partial failure: how many renamed, how many keep their names', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      files[`notes/${ULID_B}.md`] = '# Survivor\n'

      await runFilenameMigration({
        candidates: [
          { path: CANDIDATE.path, title: 'Ghost' }, // file vanished
          { path: `notes/${ULID_B}.md`, title: 'Survivor' },
        ],
        generation: 3,
      })

      expect(operations.log[0]?.outcome).toBe('failed')
      expect(operations.log[0]?.message).toContain('renamed 1 of 2')
      expect(operations.log[0]?.message).toContain('reopening the graph offers the rest again')
    } finally {
      errorSpy.mockRestore()
    }
  })
})
