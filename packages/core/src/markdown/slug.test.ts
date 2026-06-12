import { describe, expect, it } from 'vitest'
import { slugForTitle } from './slug'

/**
 * The golden corpus FREEZES the slug rules: changing `slugForTitle`'s output
 * for any of these titles re-slugs existing graphs differently — a rename
 * storm. A failure here is a deliberate-breaking-change gate, not a bug to
 * "fix" by updating the expectation casually.
 */
const GOLDEN: ReadonlyArray<readonly [title: string, slug: string]> = [
  ['Meeting Notes', 'meeting-notes'],
  ['My Note', 'my-note'],
  ["Don't Panic", 'dont-panic'],
  ['C++ rocks', 'c-rocks'],
  ['v2.0 Plan', 'v20-plan'],
  ['Mr. Smith', 'mr-smith'],
  ['  padded  title  ', 'padded-title'],
  ['snake_case_title', 'snake-case-title'],
  ['follow-up', 'follow-up'],
  ['a — em dash', 'a-em-dash'],
  ['Café au lait', 'café-au-lait'],
  ['ÜBER Straße', 'über-straße'],
  ['日本語ノート', '日本語ノート'],
  ['한국어 노트', '한국어-노트'],
  ['🎉 Party! 🎉', 'party'],
  ['Q3 / Q4 Review', 'q3-q4-review'],
  ['path\\with\\slashes', 'pathwithslashes'],
  ['colons: and "quotes"', 'colons-and-quotes'],
  ['<angle> & |pipe|?', 'angle-pipe'],
  ['...dots at edges...', 'dots-at-edges'],
  ['2024', '2024'],
  ['CON', 'con-note'],
  ['lpt7', 'lpt7-note'],
  ['', 'untitled'],
  ['   ', 'untitled'],
  ['!!!', 'untitled'],
  ['🎉🎉🎉', 'untitled'],
]

describe('slugForTitle', () => {
  it.each(GOLDEN)('golden: %j → %j', (title, slug) => {
    expect(slugForTitle(title)).toBe(slug)
  })

  const PROPERTY_INPUTS = [
    ...GOLDEN.map(([title]) => title),
    'a'.repeat(500),
    `${'日'.repeat(200)} tail`,
    '𝒜𝒷𝒸 math letters', // astral-plane (surrogate-pair) letters
    'MiXeD CaSe TiTlE',
    'Ångström—Δelta',
    '-leading and trailing-',
    'word'.padEnd(85, '-'),
  ]

  it.each(PROPERTY_INPUTS.map((input) => [input]))('is idempotent for %j', (title) => {
    const once = slugForTitle(title)
    expect(slugForTitle(once)).toBe(once)
  })

  it.each(PROPERTY_INPUTS.map((input) => [input]))(
    'output is lowercase, bounded, and filename-safe for %j',
    (title) => {
      const slug = slugForTitle(title)
      expect(slug).not.toBe('')
      expect([...slug].length).toBeLessThanOrEqual(80)
      // The byte budget is the real filesystem constraint: basenames cap at
      // 255 *bytes* (APFS/ext4/NTFS), and astral letters cost 4 each.
      expect(new TextEncoder().encode(slug).length).toBeLessThanOrEqual(200)
      expect(slug).toBe(slug.toLowerCase())
      expect(slug).toBe(slug.normalize('NFC'))
      // No path separators, no Windows-reserved characters, no whitespace,
      // no edge dashes/dots (Windows trims trailing dots/spaces).
      expect(slug).not.toMatch(/[\s/\\:*?"<>|.]/)
      expect(slug).not.toMatch(/^-|-$/)
    },
  )

  it('caps astral-plane titles without splitting surrogate pairs', () => {
    const slug = slugForTitle('𝒜'.repeat(100))
    expect([...slug].length).toBeLessThanOrEqual(80)
    // Round-trips through code points cleanly (no lone surrogates).
    expect(slug).toBe([...slug].join(''))
    expect(slug.includes('�')).toBe(false)
  })

  it('caps by bytes when every code point is 4 UTF-8 bytes', () => {
    // 80 astral letters fit the code-point cap but would be 320 bytes —
    // over the 255-byte basename limit once `.md` is appended. The byte
    // budget must cut first.
    const slug = slugForTitle('𝒜'.repeat(80))
    expect(new TextEncoder().encode(slug).length).toBeLessThanOrEqual(200)
    expect(slugForTitle(slug)).toBe(slug)
  })

  it('caps 3-byte scripts by bytes too', () => {
    const slug = slugForTitle('日'.repeat(80))
    expect(new TextEncoder().encode(slug).length).toBeLessThanOrEqual(200)
    expect([...slug].every((char) => char === '日')).toBe(true)
    expect(slugForTitle(slug)).toBe(slug)
  })
})
