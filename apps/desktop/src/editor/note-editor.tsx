import { useImperativeHandle, useMemo, useState, type Ref } from 'react'
import {
  defineEditorExtension,
  defineMarkMode,
  docToMarkdown,
  markdownToDoc,
  type MarkMode,
  type TypedEditor,
} from '@meowdown/core'
import { createEditor, defineDocChangeHandler, union, type Editor } from '@prosekit/core'
import { ProseKit, useExtension } from '@prosekit/react'
import '@meowdown/core/style.css'
import { defineReflectKeymap } from './keymap'
import { defineWikiLinks } from './wiki-links'

/**
 * Reflect's editor (Plan 05): meowdown's extension set composed with our own
 * (wiki-link chips, the central keymap). Mirrors `@meowdown/react`'s `<Editor>`
 * — which accepts no extra extensions — so we own the composition point.
 *
 * The component is **uncontrolled**: `initialContent` is read once. Showing a
 * different note or reloading after an external change goes through the
 * imperative {@link NoteEditorHandle} (or a remount via `key`), never a prop
 * change — the Plan 05 contract.
 */

/** Imperative surface for note switching, reload, and save flushes. */
export interface NoteEditorHandle {
  /** Replace the document (note switch / external reload). */
  setMarkdown(markdown: string): void
  /** Serialize the current document to markdown. */
  getMarkdown(): string
  focus(): void
}

interface NoteEditorProps {
  /** Initial markdown, read only on first render (uncontrolled). */
  initialContent: string
  /** Called with the current markdown whenever the document changes. */
  onChange?: (markdown: string) => void
  /** How markdown syntax characters are shown; `focus` reveals them near the caret. */
  markMode?: MarkMode
  /** Imperative handle (React 19 ref-as-prop). */
  handleRef?: Ref<NoteEditorHandle>
}

function createNoteEditor(initialContent: string): Editor {
  const editor = createEditor({
    extension: union(defineEditorExtension(), defineWikiLinks(), defineReflectKeymap()),
  })
  if (initialContent) {
    // Our union schema is a superset of meowdown's; the converters only touch
    // the meowdown-owned types, so the TypedEditor view of it is sound.
    editor.setContent(markdownToDoc(editor as TypedEditor, initialContent))
  }
  return editor
}

export function NoteEditor({
  initialContent,
  onChange,
  markMode = 'focus',
  handleRef,
}: NoteEditorProps) {
  const [editor] = useState(() => createNoteEditor(initialContent))

  useExtension(
    useMemo(() => defineMarkMode(markMode), [markMode]),
    { editor },
  )

  useExtension(
    useMemo(
      () =>
        onChange
          ? defineDocChangeHandler(() => {
              onChange(docToMarkdown(editor.state.doc))
            })
          : null,
      [onChange, editor],
    ),
    { editor },
  )

  useImperativeHandle(
    handleRef,
    () => ({
      setMarkdown: (markdown: string) => {
        editor.setContent(markdownToDoc(editor as TypedEditor, markdown))
      },
      getMarkdown: () => docToMarkdown(editor.state.doc),
      focus: () => editor.focus(),
    }),
    [editor],
  )

  return (
    <ProseKit editor={editor}>
      <div ref={editor.mount} className="reflect-editor" />
    </ProseKit>
  )
}
