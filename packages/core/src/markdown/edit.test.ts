import { describe, expect, it } from 'vitest'
import { appendBlock, appendUnderHeading, renameWikiLink } from './edit'

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

describe('appendBlock', () => {
  it('appends one blank line after the existing content', () => {
    expect(appendBlock('alpha\n', 'new text')).toBe('alpha\n\nnew text\n')
  })

  it('collapses extra trailing whitespace to the single separator', () => {
    expect(appendBlock('alpha\n\n\n', 'new text')).toBe('alpha\n\nnew text\n')
  })

  it('becomes the whole body of an empty note', () => {
    expect(appendBlock('', 'new text')).toBe('new text\n')
    expect(appendBlock('\n', 'new text')).toBe('new text\n')
  })

  it('appends after frontmatter when the note has nothing else', () => {
    expect(appendBlock('---\nprivate: true\n---\n', 'new text')).toBe(
      '---\nprivate: true\n---\n\nnew text\n',
    )
  })

  it('trims the block itself', () => {
    expect(appendBlock('alpha', '  new text \n')).toBe('alpha\n\nnew text\n')
  })
})
