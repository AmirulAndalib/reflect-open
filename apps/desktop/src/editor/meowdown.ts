import {
  defineEditorExtension,
  docToMarkdown,
  markdownToDoc,
  type TypedEditor,
} from '@meowdown/core'
import { createEditor, union, type Editor, type Extension } from '@prosekit/core'
import type { EditorNode } from '@prosekit/pm/model'
import '@meowdown/react/style.css'

/**
 * Reflect's single coupling point to meowdown. Every meowdown import — the
 * engine, the converters, the stylesheet, the engine's own key bindings —
 * lives in this module; the rest of the app builds on the surface exported
 * here. When updating meowdown, start (and ideally end) at this file.
 *
 * Reflect composes the engine itself instead of rendering `@meowdown/react`'s
 * `<Editor>`: that component accepts no extra extensions, and Reflect needs
 * its own (wiki-link navigation, image persistence, the heading keymap) plus
 * imperative document replacement for note switching and external reloads.
 * The react package still supplies the stylesheet (core theme + selection
 * styling under the `.meowdown` wrapper class) and the {@link
 * MeowdownEditorHandle} contract Reflect's editor handle extends.
 */

export { defineMarkMode, type MarkMode } from '@meowdown/core'
export type { EditorHandle as MeowdownEditorHandle } from '@meowdown/react'

/**
 * Create an editor running meowdown's engine plus Reflect's `extra`
 * extensions, seeded with `markdown`.
 */
export function createMeowdownEditor(markdown: string, extra?: Extension): Editor {
  const extension = extra ? union(defineEditorExtension(), extra) : defineEditorExtension()
  const editor = createEditor({ extension })
  if (markdown) {
    editor.setContent(parseMarkdown(editor, markdown))
  }
  return editor
}

/** Parse markdown into a document for `editor`. */
export function parseMarkdown(editor: Editor, markdown: string): EditorNode {
  // Reflect's union schema is a superset of meowdown's; the converters only
  // touch the meowdown-owned types, so the TypedEditor view of it is sound.
  return markdownToDoc(editor as TypedEditor, markdown)
}

/** Serialize a document back to markdown. */
export function serializeMarkdown(doc: EditorNode): string {
  return docToMarkdown(doc)
}

/**
 * The shortcuts `defineEditorExtension()` binds itself (the meowdown README's
 * "Shortcuts" table) — version-coupled, so kept here with the rest of the
 * meowdown surface. The keymap registry claims these keys editor-scope so no
 * other feature can shadow them, and the Keyboard settings section lists them
 * like any other binding.
 */
export const MEOWDOWN_BINDING_DESCRIPTIONS: Record<string, string> = {
  'Mod-b': 'Bold',
  'Mod-i': 'Italic',
  'Mod-e': 'Inline code',
  'Mod-Shift-x': 'Strikethrough',
}
