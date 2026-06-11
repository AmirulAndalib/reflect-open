import { describe, expect, it } from 'vitest'
import { computeImageRanges, defineImages } from './images'
import { createMeowdownEditor, serializeMarkdown } from './meowdown'

function editorWith(markdown: string) {
  return createMeowdownEditor(
    markdown,
    defineImages({ resolveUrl: (src) => (src.startsWith('assets/') ? `asset://${src}` : null) }),
  )
}

describe('image rendering', () => {
  it('finds renderable images with their widget anchor', () => {
    const editor = editorWith('Before\n\nA pic ![shot](assets/s.png) here.')
    const ranges = computeImageRanges(editor.state)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({ alt: 'shot', src: 'assets/s.png' })
    // The widget anchors at the end of the paragraph containing the image.
    const paragraphEnd = ranges[0].widgetAt
    expect(editor.state.doc.resolve(paragraphEnd).parent.textContent).toContain('![shot]')
  })

  it('ignores images inside code', () => {
    expect(computeImageRanges(editorWith('```\n![x](assets/y.png)\n```').state)).toEqual([])
    expect(computeImageRanges(editorWith('see `![x](assets/y.png)`').state)).toEqual([])
  })

  it('never changes serialization (widgets only)', () => {
    const markdown = 'A pic ![shot](assets/s.png) and ![ext](https://x.com/i.jpg).'
    const editor = editorWith(markdown)
    expect(serializeMarkdown(editor.state.doc).replace(/\n$/, '')).toBe(markdown)
  })
})
