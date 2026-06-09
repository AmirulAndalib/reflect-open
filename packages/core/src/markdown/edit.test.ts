import { describe, expect, it } from 'vitest'
import { appendUnderHeading, renameWikiLink } from './edit'

describe('renameWikiLink', () => {
  it('rewrites matching targets, preserves aliases, skips code and non-matches', () => {
    const source = '[[Foo]] and [[foo|bar]] and `[[Foo]]` and [[Other]]'
    expect(renameWikiLink(source, 'Foo', 'Baz')).toBe(
      '[[Baz]] and [[Baz|bar]] and `[[Foo]]` and [[Other]]',
    )
  })

  it('is a byte-identical no-op when nothing matches', () => {
    const source = 'see [[Alpha]] and [[Beta]]'
    expect(renameWikiLink(source, 'Gamma', 'Delta')).toBe(source)
  })

  it('matches on the trimmed, case-folded target', () => {
    const source = '[[ Foo ]] and [[Foo]] and [[ foo|bar]]'
    expect(renameWikiLink(source, 'Foo', 'Baz')).toBe('[[Baz]] and [[Baz]] and [[Baz|bar]]')
  })

  it('rejects a destination target containing wiki-link syntax', () => {
    expect(() => renameWikiLink('[[Foo]]', 'Foo', 'A|B')).toThrow(/invalid wiki-link target/i)
  })
})

describe('appendUnderHeading', () => {
  const doc = '# A\n\nalpha\n\n# B\n\nbeta'

  it('inserts at the end of a heading section, before the next sibling heading', () => {
    expect(appendUnderHeading(doc, 'A', '- new')).toBe('# A\n\nalpha\n\n- new\n\n# B\n\nbeta')
  })

  it('appends at end of file for the last section', () => {
    expect(appendUnderHeading(doc, 'B', '- new')).toBe('# A\n\nalpha\n\n# B\n\nbeta\n\n- new\n')
  })

  it('creates a new section when the heading is missing', () => {
    expect(appendUnderHeading(doc, 'Inbox', '- new')).toBe(
      '# A\n\nalpha\n\n# B\n\nbeta\n\n## Inbox\n\n- new\n',
    )
  })

  it('matches the heading case-insensitively', () => {
    expect(appendUnderHeading(doc, 'a', '- new')).toBe('# A\n\nalpha\n\n- new\n\n# B\n\nbeta')
  })
})
