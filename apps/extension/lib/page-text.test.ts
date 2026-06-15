import { describe, expect, it } from 'vitest'
import { formatParagraphs, normalizeParagraphText } from './page-text'

describe('normalizeParagraphText', () => {
  it('collapses inline whitespace inside one paragraph', () => {
    expect(normalizeParagraphText('  First\n paragraph\t with   spaces.  ')).toBe(
      'First paragraph with spaces.',
    )
  })
})

describe('formatParagraphs', () => {
  it('keeps paragraph breaks while dropping empty paragraphs', () => {
    expect(formatParagraphs([' First paragraph. ', ' ', 'Second\nparagraph.'])).toBe(
      'First paragraph.\n\nSecond paragraph.',
    )
  })
})
