import { describe, expect, it } from 'vitest'
import { createMeowdownEditor, serializeMarkdown } from './meowdown'

/**
 * Spike gate (Plan 01 step 8): does markdown — including `[[wiki links]]`,
 * which meowdown 0.3.0 parses into native marks over the literal text —
 * survive a markdownToDoc → docToMarkdown round-trip without loss? meowdown
 * keeps inline syntax as literal text, so the expectation is yes.
 */
function roundtrip(markdown: string): string {
  return serializeMarkdown(createMeowdownEditor(markdown).state.doc)
}

describe('meowdown markdown round-trip', () => {
  const cases = [
    '# Heading',
    'A paragraph with [[Wiki Link]] inside.',
    '[[Note|alias]]',
    'Link to [[2026-06-09]] daily note.',
    '**bold** and _em_ and `code`',
    '> a quote',
    '- [ ] buy milk\n- [x] done',
    '#tag in a paragraph',
  ]

  for (const markdown of cases) {
    it(`preserves ${JSON.stringify(markdown)}`, () => {
      // docToMarkdown appends a single trailing newline (standard block-level
      // markdown serialization); content must otherwise be byte-identical.
      expect(roundtrip(markdown).replace(/\n$/, '')).toBe(markdown)
    })
  }

  it('appends exactly one trailing newline', () => {
    expect(roundtrip('# Heading')).toBe('# Heading\n')
  })

  // KNOWN NORMALIZATION: docToMarkdown emits tight lists, so a loose source
  // list loses its blank lines. Not content loss — checkRoundTrip classifies
  // it 'normalizing' — but a save reformats such a note.
  it('tightens loose lists (documents the normalization)', () => {
    expect(roundtrip('- item one\n\n- item two')).toBe('- item one\n- item two\n')
  })
})
