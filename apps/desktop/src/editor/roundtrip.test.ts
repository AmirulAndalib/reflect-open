import { describe, expect, it } from 'vitest'
import { checkRoundTrip } from './roundtrip'

describe('checkRoundTrip', () => {
  it('classifies faithful content as exact', () => {
    const cases = [
      '# Heading\n\nA paragraph with [[Wiki Link]] and **bold**.\n',
      '> quote\n',
      '```\ncode [[not a link]]\n\nblank line inside fence\n```\n',
      '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
      '- item one\n- item two\n',
      '- [ ] buy milk\n- [x] done\n',
    ]
    for (const markdown of cases) {
      expect(checkRoundTrip(markdown), markdown).toBe('exact')
    }
  })

  it('classifies tightened loose lists as normalizing (content preserved)', () => {
    expect(checkRoundTrip('- item one\n\n- item two\n')).toBe('normalizing')
  })

  it('classifies remaining converter gaps as lossy', () => {
    // Setext heading text is dropped (`Title\n=====` → empty heading), and raw
    // HTML blocks vanish entirely. The guard exists to catch exactly this; when
    // a gap is fixed upstream, its case starts failing and can move to exact.
    expect(checkRoundTrip('Title\n=====\n\nbody\n')).toBe('lossy')
    expect(checkRoundTrip('<div>raw html</div>\n')).toBe('lossy')
  })
})
