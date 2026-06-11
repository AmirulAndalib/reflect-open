import { TextSelection, type EditorState } from '@prosekit/pm/state'
import { describe, expect, it } from 'vitest'
import { EDITOR_BINDINGS, defineReflectKeymap, listRegisteredBindings, registerKeymap } from './keymap'
import { createMeowdownEditor, serializeMarkdown } from './meowdown'

function stateWithSelection(markdown: string, from: number, to: number): EditorState {
  const editor = createMeowdownEditor(markdown, defineReflectKeymap())
  return editor.state.apply(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
  )
}

function runBinding(state: EditorState, key: string): string {
  const command = EDITOR_BINDINGS[key]
  let next = state
  expect(command(state, (tr) => (next = state.apply(tr)), undefined)).toBe(true)
  return serializeMarkdown(next.doc).replace(/\n$/, '')
}

describe('keymap registry', () => {
  it('rejects duplicate bindings across scopes', () => {
    expect(() => registerKeymap('app', { 'Mod-b': 'collides' })).toThrow(/duplicate keybinding/)
  })

  it('registers all-or-nothing: a colliding batch commits no keys', () => {
    expect(() =>
      registerKeymap('app', { 'Mod-zz-unique': 'fine', 'Mod-b': 'collides' }),
    ).toThrow(/duplicate keybinding/)
    expect(listRegisteredBindings().has('Mod-zz-unique')).toBe(false)
    expect(listRegisteredBindings().get('Mod-b')).toBe('editor') // untouched
  })

  it('holds the editor bindings exactly once', () => {
    const bindings = listRegisteredBindings()
    expect(bindings.get('Mod-b')).toBe('editor')
    expect(bindings.get('Mod-i')).toBe('editor')
    expect(bindings.get('Mod-e')).toBe('editor')
  })
})

describe('heading toggles', () => {
  // Doc positions: paragraph starts at 1.
  it('sets and unsets the block heading level', () => {
    expect(runBinding(stateWithSelection('hello', 2, 2), 'Mod-1')).toBe('# hello')
    expect(runBinding(stateWithSelection('# hello', 2, 2), 'Mod-1')).toBe('hello')
    expect(runBinding(stateWithSelection('# hello', 2, 2), 'Mod-2')).toBe('## hello')
    expect(runBinding(stateWithSelection('hello', 2, 2), 'Mod-3')).toBe('### hello')
    expect(runBinding(stateWithSelection('### hello', 2, 2), 'Mod-3')).toBe('hello')
  })
})
