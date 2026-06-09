import { describe, expect, it } from 'vitest'
import { scanInlineWikiLinks } from './scan'

describe('scanInlineWikiLinks', () => {
  it('finds plain and aliased links with display spans', () => {
    const text = 'See [[Charlotte]] and [[Project X|the project]].'
    const links = scanInlineWikiLinks(text)
    expect(links).toHaveLength(2)

    const [plain, aliased] = links
    expect(plain.target).toBe('Charlotte')
    expect(plain.alias).toBeNull()
    expect(text.slice(plain.from, plain.to)).toBe('[[Charlotte]]')
    expect(text.slice(plain.displayFrom, plain.displayTo)).toBe('Charlotte')

    expect(aliased.target).toBe('Project X')
    expect(aliased.alias).toBe('the project')
    expect(text.slice(aliased.from, aliased.to)).toBe('[[Project X|the project]]')
    expect(text.slice(aliased.displayFrom, aliased.displayTo)).toBe('the project')
  })

  it('respects code contexts, same as the indexer grammar', () => {
    expect(scanInlineWikiLinks('code `[[NotALink]]` stays literal')).toEqual([])
    expect(scanInlineWikiLinks('and [[]] is not a link')).toEqual([])
  })

  it('returns [] quickly for text without brackets', () => {
    expect(scanInlineWikiLinks('no links here')).toEqual([])
  })
})
