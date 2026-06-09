import { docToMarkdown, markdownToDoc, type TypedEditor } from '@meowdown/core'
import { createEditor, union } from '@prosekit/core'
import { defineEditorExtension } from '@meowdown/core'
import { TextSelection } from '@prosekit/pm/state'
import { describe, expect, it } from 'vitest'
import { computeWikiLinkRanges, defineWikiLinks } from './wiki-links'

function editorWith(markdown: string) {
  const editor = createEditor({ extension: union(defineEditorExtension(), defineWikiLinks()) })
  editor.setContent(markdownToDoc(editor as unknown as TypedEditor, markdown))
  return editor
}

describe('wiki-link decorations', () => {
  it('marks chip and syntax ranges over the literal text', () => {
    const editor = editorWith('See [[Charlotte]] here.')
    const ranges = computeWikiLinkRanges(editor.state)

    const chip = ranges.find((range) => range.kind === 'chip')
    expect(chip).toBeDefined()
    expect(chip!.target).toBe('Charlotte')
    expect(editor.state.doc.textBetween(chip!.from, chip!.to)).toBe('[[Charlotte]]')

    const marks = ranges.filter((range) => range.kind === 'mark')
    expect(marks.map((range) => editor.state.doc.textBetween(range.from, range.to))).toEqual([
      '[[',
      ']]',
    ])
    expect(ranges.every((range) => !range.active)).toBe(true)
  })

  it('treats the alias as display text and the target as syntax', () => {
    const editor = editorWith('[[Project X|the project]]')
    const marks = computeWikiLinkRanges(editor.state).filter((range) => range.kind === 'mark')
    expect(marks.map((range) => editor.state.doc.textBetween(range.from, range.to))).toEqual([
      '[[Project X|',
      ']]',
    ])
  })

  it('activates (reveals syntax) when the caret is inside the link', () => {
    const editor = editorWith('See [[Charlotte]] here.')
    const chip = computeWikiLinkRanges(editor.state).find((range) => range.kind === 'chip')!
    const inside = editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, chip.from + 3),
    )
    const ranges = computeWikiLinkRanges(editor.state.apply(inside))
    expect(ranges.every((range) => range.active)).toBe(true)
  })

  it('decorates nothing inside code blocks or code spans', () => {
    expect(computeWikiLinkRanges(editorWith('```\n[[NotALink]]\n```').state)).toEqual([])
    expect(computeWikiLinkRanges(editorWith('code `[[NotALink]]` stays').state)).toEqual([])
  })

  it('never changes serialization (decorations only)', () => {
    const cases = ['See [[Charlotte]].', '[[Note|alias]] and **bold**', '- [[In a list]]']
    for (const markdown of cases) {
      const editor = editorWith(markdown)
      expect(docToMarkdown(editor.state.doc).replace(/\n$/, '')).toBe(markdown)
    }
  })
})
