import { TextSelection, type EditorState } from '@prosekit/pm/state'
import type { EditorView } from '@prosekit/pm/view'
import { describe, expect, it, vi } from 'vitest'
import { createMeowdownEditor } from './meowdown'
import { clickEditsLink, createWikiLinkPlugin, defineWikiLinks, wikiLinkAt } from './wiki-links'

function editorWith(markdown: string) {
  return createMeowdownEditor(markdown, defineWikiLinks())
}

/** The link containing the first occurrence of `[[target`, by document position. */
function linkFor(state: EditorState, target: string) {
  const offset = state.doc.textContent.indexOf(`[[${target}`)
  expect(offset).toBeGreaterThanOrEqual(0)
  // Single-paragraph fixtures: textContent offsets sit at position offset + 1.
  return wikiLinkAt(state, offset + 1 + 2)!
}

describe('wikiLinkAt', () => {
  it('finds the link spanning the whole [[…]] with its target', () => {
    const state = editorWith('See [[Charlotte]] here.').state
    const hit = linkFor(state, 'Charlotte')
    expect(hit.target).toBe('Charlotte')
    expect(state.doc.textBetween(hit.from, hit.to)).toBe('[[Charlotte]]')
  })

  it('resolves an aliased link to its target', () => {
    const state = editorWith('[[Project X|the project]]').state
    expect(linkFor(state, 'Project X').target).toBe('Project X')
  })

  it('finds nothing inside code blocks or code spans', () => {
    expect(wikiLinkAt(editorWith('```\n[[NotALink]]\n```').state, 4)).toBeNull()
    const inline = editorWith('code `[[NotALink]]` stays').state
    expect(wikiLinkAt(inline, inline.doc.textContent.indexOf('[[') + 3)).toBeNull()
  })

  it('finds nothing outside any link', () => {
    expect(wikiLinkAt(editorWith('See [[Charlotte]] here.').state, 2)).toBeNull()
  })
})

describe('wiki-link click navigation', () => {
  function caretInside(state: EditorState, pos: number): EditorState {
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
  }

  /** A click landing on one of the engine's rendered `.md-wikilink` spans. */
  function linkClickEvent(init: MouseEventInit = {}): MouseEvent {
    const span = document.createElement('span')
    span.className = 'md-wikilink'
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
    const link = linkFor(state, 'Charlotte')
    const { handled, onNavigate } = press(state, link.from + 3, linkClickEvent())
    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('Charlotte')
  })

  it('places the caret instead when the clicked link is already being edited', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const link = linkFor(state, 'Charlotte')
    const editing = caretInside(state, link.from + 3)
    expect(clickEditsLink(editing, link.from + 5, { from: link.from + 3, to: link.from + 3, empty: true })).toBe(true)
    const { handled, onNavigate } = press(editing, link.from + 5, linkClickEvent())
    expect(handled).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('Mod+click navigates even while editing the link', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const link = linkFor(state, 'Charlotte')
    const editing = caretInside(state, link.from + 3)
    const { handled, onNavigate } = press(editing, link.from + 5, linkClickEvent({ metaKey: true }))
    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('Charlotte')
  })

  it('navigates when clicking one link while editing another', () => {
    const { state } = editorWith('[[Alpha]] and [[Beta]]')
    const editing = caretInside(state, linkFor(state, 'Alpha').from + 3)
    const beta = linkFor(editing, 'Beta')
    const { handled, onNavigate } = press(editing, beta.from + 3, linkClickEvent())
    expect(handled).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('Beta')
  })

  it('ignores clicks that do not land on a rendered link span', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const link = linkFor(state, 'Charlotte')
    const event = new MouseEvent('click')
    Object.defineProperty(event, 'target', { value: document.createElement('span') })
    const { handled, onNavigate } = press(state, link.from + 3, event)
    expect(handled).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('ignores clicks whose position falls outside any link', () => {
    const { state } = editorWith('See [[Charlotte]] here.')
    const { handled, onNavigate } = press(state, 1, linkClickEvent())
    expect(handled).toBe(false)
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
