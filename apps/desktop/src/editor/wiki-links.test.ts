import { docToMarkdown, markdownToDoc, type TypedEditor } from '@meowdown/core'
import { createEditor, union } from '@prosekit/core'
import { defineEditorExtension } from '@meowdown/core'
import { TextSelection, type EditorState } from '@prosekit/pm/state'
import type { EditorView } from '@prosekit/pm/view'
import { describe, expect, it, vi } from 'vitest'
import { computeWikiLinkRanges, createWikiLinkPlugin, defineWikiLinks } from './wiki-links'

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

describe('wiki-link click navigation', () => {
  function chipFor(state: EditorState, target: string) {
    return computeWikiLinkRanges(state).find(
      (range) => range.kind === 'chip' && range.target === target,
    )!
  }

  function caretInside(state: EditorState, pos: number): EditorState {
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
  }

  function chipClickEvent(target: string, init: MouseEventInit = {}): MouseEvent {
    const span = document.createElement('span')
    span.setAttribute('data-wiki-target', target)
    const event = new MouseEvent('click', init)
    Object.defineProperty(event, 'target', { value: span })
    return event
  }

  /** Run the gesture the way ProseMirror does: mousedown snapshot, then click. */
  function press(state: EditorState, pos: number, event: MouseEvent) {
    const onNavigate = vi.fn()
    const plugin = createWikiLinkPlugin({ onNavigate })
    const view = { state } as unknown as EditorView
    plugin.props.handleDOMEvents!.mousedown!.call(plugin, view, new MouseEvent('mousedown'))
    const handled = plugin.props.handleClick!.call(plugin, view, pos, event)
    return { handled, onNavigate }
  }

  it('navigates on plain click of a rendered link', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const chip = chipFor(state, 'Charlotte')
    const { handled, onNavigate } = press(state, chip.from + 3, chipClickEvent('Charlotte'))
    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('Charlotte')
  })

  it('places the caret instead when the clicked link is already being edited', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const chip = chipFor(state, 'Charlotte')
    const editing = caretInside(state, chip.from + 3)
    const { handled, onNavigate } = press(editing, chip.from + 5, chipClickEvent('Charlotte'))
    expect(handled).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('Mod+click navigates even while editing the link', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const chip = chipFor(state, 'Charlotte')
    const editing = caretInside(state, chip.from + 3)
    const { handled, onNavigate } = press(
      editing,
      chip.from + 5,
      chipClickEvent('Charlotte', { metaKey: true }),
    )
    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('Charlotte')
  })

  it('navigates when clicking one link while editing another', () => {
    const { state } = editorWith('[[Alpha]] and [[Beta]]')
    const editing = caretInside(state, chipFor(state, 'Alpha').from + 3)
    const beta = chipFor(editing, 'Beta')
    const { handled, onNavigate } = press(editing, beta.from + 3, chipClickEvent('Beta'))
    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('Beta')
  })

  it('ignores clicks outside any link', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const event = new MouseEvent('click')
    Object.defineProperty(event, 'target', { value: document.createElement('span') })
    const { handled, onNavigate } = press(state, 1, event)
    expect(handled).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
