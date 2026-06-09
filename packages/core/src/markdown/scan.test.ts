import { describe, expect, it } from 'vitest'
import { scanInlineImages, scanInlineWikiLinks } from './scan'

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

  it('falls back to the target when the alias is blank', () => {
    const text = 'see [[Target|   ]] here'
    const [link] = scanInlineWikiLinks(text)
    expect(link.alias).toBeNull()
    expect(text.slice(link.displayFrom, link.displayTo)).toBe('Target')
  })

  it('respects code contexts, same as the indexer grammar', () => {
    expect(scanInlineWikiLinks('code `[[NotALink]]` stays literal')).toEqual([])
    expect(scanInlineWikiLinks('and [[]] is not a link')).toEqual([])
  })

  it('returns [] quickly for text without brackets', () => {
    expect(scanInlineWikiLinks('no links here')).toEqual([])
  })
})

describe('scanInlineImages', () => {
  it('finds images with alt and src spans', () => {
    const text = 'A pic ![screenshot](assets/shot.png) and ![](https://x.com/i.jpg "t").'
    const images = scanInlineImages(text)
    expect(images).toHaveLength(2)
    expect(images[0]).toMatchObject({ alt: 'screenshot', src: 'assets/shot.png' })
    expect(text.slice(images[0].from, images[0].to)).toBe('![screenshot](assets/shot.png)')
    expect(images[1]).toMatchObject({ alt: '', src: 'https://x.com/i.jpg' })
  })

  it('respects code contexts and plain links', () => {
    expect(scanInlineImages('code `![x](y.png)` stays literal')).toEqual([])
    expect(scanInlineImages('a [link](not-an-image.png) only')).toEqual([])
    expect(scanInlineImages('no images')).toEqual([])
  })
})
