import { afterEach, describe, expect, it } from 'vitest'
import { parseNote, setBridge, isPinned } from '@reflect/core'
import { seedWelcomeNote, WELCOME_NOTE_PATH } from './welcome-note'

interface WrittenNote {
  path: string
  contents: string
}

function installFakeBridge(existingFiles: string[]): WrittenNote[] {
  const written: WrittenNote[] = []
  setBridge({
    invoke: async (command, args) => {
      switch (command) {
        case 'list_files':
          return existingFiles.map((path) => ({ path, size: 0, modifiedMs: 0 }))
        case 'note_write':
          written.push({ path: String(args.path), contents: String(args.contents) })
          return null
        default:
          throw new Error(`unexpected command: ${command}`)
      }
    },
    listen: async () => () => {},
  })
  return written
}

afterEach(() => {
  setBridge(null)
})

describe('seedWelcomeNote', () => {
  it('seeds a pinned, id-carrying how-to note into an empty graph', async () => {
    const written = installFakeBridge([])
    expect(await seedWelcomeNote(1)).toBe(true)
    expect(written).toHaveLength(1)
    expect(written[0].path).toBe(WELCOME_NOTE_PATH)
    expect(WELCOME_NOTE_PATH).toBe('notes/how-to-use-reflect.md')

    const { frontmatter, title } = parseNote({
      path: written[0].path,
      source: written[0].contents,
    })
    expect(title).toBe('How to use Reflect')
    expect(isPinned(frontmatter)).toBe(true)
    expect(frontmatter.id).toMatch(/^[0-9a-z]{26}$/)
    expect(written[0].contents).toContain('[[Wiki Links]]')
  })

  it('never writes into a graph that already has notes', async () => {
    const written = installFakeBridge(['daily/2026-06-12.md'])
    expect(await seedWelcomeNote(1)).toBe(false)
    expect(written).toHaveLength(0)
  })
})
