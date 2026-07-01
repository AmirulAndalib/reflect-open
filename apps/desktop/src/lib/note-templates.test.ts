import { describe, expect, it, vi } from 'vitest'

const readNote = vi.hoisted(() => vi.fn())
const writeNote = vi.hoisted(() => vi.fn(async () => undefined))
const availableTemplatePath = vi.hoisted(() => vi.fn(async () => 'templates/daily-review.md'))
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  readNote,
  writeNote,
  availableTemplatePath,
}))

const { createTemplate, templateBody } = await import('./note-templates')

describe('templateBody', () => {
  it('strips frontmatter — template metadata is never inserted', async () => {
    readNote.mockResolvedValueOnce('---\nprivate: true\n---\n# Journal\n\nMood:\n')
    await expect(templateBody('templates/journal.md')).resolves.toBe('# Journal\n\nMood:\n')
  })

  it('returns a frontmatter-less template verbatim', async () => {
    readNote.mockResolvedValueOnce('# Person\n\n- Company:\n')
    await expect(templateBody('templates/person.md')).resolves.toBe('# Person\n\n- Company:\n')
  })
})

describe('createTemplate', () => {
  it('writes the name as the H1 at the probed slug path', async () => {
    await expect(createTemplate('  Daily Review ', 7)).resolves.toBe('templates/daily-review.md')
    expect(availableTemplatePath).toHaveBeenCalledWith('daily-review')
    expect(writeNote).toHaveBeenCalledWith('templates/daily-review.md', '# Daily Review\n', 7)
  })
})
