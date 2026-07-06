import { describe, expect, it } from 'vitest'
import { blockContextAt } from './block-context'

/** Offset of the first `[[target]]` occurrence — the index's `pos_from`. */
function posOf(content: string, link: string): number {
  const pos = content.indexOf(link)
  if (pos === -1) {
    throw new Error(`link ${link} not in fixture`)
  }
  return pos
}

describe('blockContextAt', () => {
  it('returns the whole paragraph, not just the physical line', () => {
    const content = 'intro line\n\nfirst wrapped line with [[Target]]\nsecond wrapped line\n\nafter\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      'first wrapped line with [[Target]]\nsecond wrapped line',
    )
  })

  it('maps whole-file offsets across frontmatter', () => {
    const content = '---\ntitle: Note\n---\n\na paragraph with [[Target]] inside\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      'a paragraph with [[Target]] inside',
    )
  })

  it('returns the heading plus its section, stopping at the next heading of any level', () => {
    const content = [
      '# Title',
      '',
      'intro',
      '',
      '## Meeting [[Target]]',
      '',
      'notes for the meeting',
      '',
      '- a bullet',
      '',
      '### Sub',
      '',
      'unrelated',
      '',
    ].join('\n')
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '## Meeting [[Target]]\n\nnotes for the meeting\n\n- a bullet',
    )
  })

  it('runs a trailing heading section to the end of the document', () => {
    const content = '## Heading [[Target]]\n\nlast paragraph\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '## Heading [[Target]]\n\nlast paragraph',
    )
  })

  it('returns a top-level list item with all its children, mentioning or not', () => {
    const content = [
      '- kickoff with [[Target]]',
      '  - prep the agenda',
      '  - book the room',
      '- unrelated sibling',
      '',
    ].join('\n')
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '- kickoff with [[Target]]\n  - prep the agenda\n  - book the room',
    )
  })

  it('keeps task children inside a top-level item', () => {
    const content = '- [[Target]] kickoff\n  + [ ] prep agenda\n  + [x] send invite\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '- [[Target]] kickoff\n  + [ ] prep agenda\n  + [x] send invite',
    )
  })

  it('shows a nested mention under its parent line, dropping mention-less siblings', () => {
    const content = [
      '- parent line',
      '  - mention of [[Target]]',
      '    - grandchild detail',
      '  - unrelated sibling',
      '',
    ].join('\n')
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '- parent line\n  - mention of [[Target]]\n    - grandchild detail',
    )
  })

  it('keeps sibling branches that mention the same target', () => {
    const content = [
      '- parent line',
      '  - first [[Target]] mention',
      '  - also [[Target]] here',
      '  - nothing relevant',
      '',
    ].join('\n')
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '- parent line\n  - first [[Target]] mention\n  - also [[Target]] here',
    )
  })

  it('matches sibling mentions case-insensitively, like link resolution', () => {
    const content = '- parent line\n  - one [[Target]]\n  - two [[target]]\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '- parent line\n  - one [[Target]]\n  - two [[target]]',
    )
  })

  it('climbs exactly one ancestor level for a deeply nested mention', () => {
    const content = [
      '- top item',
      '  - middle item',
      '    - deep [[Target]] mention',
      '  - other branch',
      '',
    ].join('\n')
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '- middle item\n  - deep [[Target]] mention',
    )
  })

  it('strips blockquote chrome from a quoted paragraph', () => {
    const content = '> quoted [[Target]] mention\n> second quoted line\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      'quoted [[Target]] mention\nsecond quoted line',
    )
  })

  it('returns the whole table for a mention in a cell', () => {
    const content = '| a | b |\n| --- | --- |\n| [[Target]] | y |\n'
    expect(blockContextAt(content, posOf(content, '[[Target]]'))).toBe(
      '| a | b |\n| --- | --- |\n| [[Target]] | y |',
    )
  })

  it('falls back to the bare line when the offset drifted between blocks', () => {
    const content = 'first paragraph\n\nsecond paragraph\n'
    expect(blockContextAt(content, content.indexOf('\n\n') + 1)).toBe('')
  })
})
