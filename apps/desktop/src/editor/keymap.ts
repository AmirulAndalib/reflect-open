import { defineKeymap, type PlainExtension } from '@prosekit/core'
import { TextSelection, type Command } from '@prosekit/pm/state'

/**
 * The central keymap registry (Plan 05 step 9). Every shortcut the app binds —
 * editor formatting here, navigation (Plan 06), `[[` autocomplete (Plan 07),
 * `⌘K` (Plan 08), the AI sidebar (Plan 10) — registers through {@link
 * registerKeymap}, which rejects duplicates so bindings can never silently
 * collide across features. Registration happens once at module scope; creating
 * editors reuses the registered map.
 */

export type KeymapScope = 'editor' | 'app'

const registeredBindings = new Map<string, KeymapScope>()

/** Register `bindings` under `scope`, throwing on any already-taken key. */
export function registerKeymap<T>(scope: KeymapScope, bindings: Record<string, T>): Record<string, T> {
  for (const key of Object.keys(bindings)) {
    const existing = registeredBindings.get(key)
    if (existing) {
      throw new Error(`duplicate keybinding "${key}": already registered by the ${existing} scope`)
    }
    registeredBindings.set(key, scope)
  }
  return bindings
}

/** Every registered binding (for the collision test + a future shortcuts UI). */
export function listRegisteredBindings(): ReadonlyMap<string, KeymapScope> {
  return registeredBindings
}

/**
 * Toggle an inline markdown marker (`**`, `_`, `` ` ``) around the selection.
 * meowdown keeps syntax as literal text, so toggling bold *is* inserting or
 * removing the marker characters — its inline pass restyles automatically.
 */
function toggleInlineMarker(marker: string): Command {
  return (state, dispatch) => {
    const { selection } = state
    if (!(selection instanceof TextSelection) || !selection.$from.sameParent(selection.$to)) {
      return false
    }
    const block = selection.$from.parent
    if (!block.isTextblock || block.type.spec.code) {
      return false
    }
    const { from, to, empty } = selection
    if (!dispatch) {
      return true
    }

    if (empty) {
      // Insert a marker pair and leave the caret between them.
      const tr = state.tr.insertText(marker + marker, from)
      tr.setSelection(TextSelection.create(tr.doc, from + marker.length))
      dispatch(tr)
      return true
    }

    const before = state.doc.textBetween(Math.max(0, from - marker.length), from)
    const after = state.doc.textBetween(to, Math.min(state.doc.content.size, to + marker.length))
    if (before === marker && after === marker) {
      // Unwrap: remove the surrounding markers (right side first so positions hold).
      const tr = state.tr.delete(to, to + marker.length).delete(from - marker.length, from)
      dispatch(tr)
      return true
    }

    // Wrap: insert at the end first so the start position is unaffected.
    const tr = state.tr.insertText(marker, to).insertText(marker, from)
    tr.setSelection(TextSelection.create(tr.doc, from + marker.length, to + marker.length))
    dispatch(tr)
    return true
  }
}

/** Reflect's editor-scope bindings — registered once, collision-checked. */
export const EDITOR_BINDINGS: Record<string, Command> = registerKeymap('editor', {
  'Mod-b': toggleInlineMarker('**'),
  'Mod-i': toggleInlineMarker('_'),
  'Mod-e': toggleInlineMarker('`'),
})

/** The editor keymap extension, composed into the editor via `union`. */
export function defineReflectKeymap(): PlainExtension {
  return defineKeymap(EDITOR_BINDINGS)
}
