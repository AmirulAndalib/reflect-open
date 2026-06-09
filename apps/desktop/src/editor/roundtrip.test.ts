import { describe, expect, it } from 'vitest'
import { checkRoundTrip } from './roundtrip'

describe('checkRoundTrip', () => {
  it('classifies faithful content as exact', () => {
    const cases = [
      '# Heading\n\nA paragraph with [[Wiki Link]] and **bold**.\n',
      '> quote\n',
      '```\ncode [[not a link]]\n\nblank line inside fence\n```\n',
      '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
    ]
    for (const markdown of cases) {
      expect(checkRoundTrip(markdown), markdown).toBe('exact')
    }
  })

  it('classifies loose-list reformatting as normalizing (content preserved)', () => {
    expect(checkRoundTrip('- item one\n- item two\n')).toBe('normalizing')
  })

  it('classifies task lists as lossy — the meowdown converter gap', () => {
    // meowdown's markdownToDoc currently drops task-item text entirely
    // (`- [ ] todo` → empty list). The guard exists to catch exactly this; when
    // the converter is fixed upstream, this test should start failing and the
    // guard expectation can be relaxed.
    expect(checkRoundTrip('- [ ] buy milk\n- [x] done\n')).toBe('lossy')
  })
})
