import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, settingsSchema } from './schema'

describe('settingsSchema', () => {
  it('defaults every key on an empty document (fresh install)', () => {
    expect(settingsSchema.parse({})).toEqual({ editorMarkdownSyntax: 'focus' })
    expect(DEFAULT_SETTINGS.editorMarkdownSyntax).toBe('focus')
  })

  it('accepts valid values', () => {
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'show' }).editorMarkdownSyntax).toBe('show')
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'focus' }).editorMarkdownSyntax).toBe('focus')
  })

  it('degrades an invalid value to its default instead of failing the load', () => {
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'sideways' }).editorMarkdownSyntax).toBe('focus')
    expect(settingsSchema.parse({ editorMarkdownSyntax: 42 }).editorMarkdownSyntax).toBe('focus')
  })

  it('preserves unknown keys so newer-version settings survive a round trip', () => {
    const parsed = settingsSchema.parse({ editorMarkdownSyntax: 'show', futureKey: true })
    expect(parsed).toEqual({ editorMarkdownSyntax: 'show', futureKey: true })
  })
})
