import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { createNoteWithTitle } from './create-note'

afterEach(() => {
  setBridge(null)
})

describe('createNoteWithTitle', () => {
  it('writes a ULID-named note whose first heading is the title', async () => {
    const invoke = vi.fn(async () => null)
    setBridge({ invoke, listen: async () => () => {} })

    const path = await createNoteWithTitle('  New Idea ', 7)

    expect(path).toMatch(/^notes\/[0-9a-z]+\.md$/)
    expect(invoke).toHaveBeenCalledWith('note_write', {
      path,
      contents: '# New Idea\n',
      generation: 7,
    })
  })
})
