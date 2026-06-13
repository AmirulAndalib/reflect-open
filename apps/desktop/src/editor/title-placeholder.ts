import type { Node as ProseMirrorNode } from '@prosekit/pm/model'
import { definePlugin, type PlainExtension } from '@prosekit/core'
import { Plugin, PluginKey } from '@prosekit/pm/state'
import { Decoration, DecorationSet } from '@prosekit/pm/view'

/**
 * Title placeholder for the new-note flow (non-daily notes): a missing note
 * opens seeded with an empty H1 and the caret in it, and this decoration
 * ghosts "Untitled" over that line so it reads as the name field it is —
 * V1's new-note pattern. The extension also marks the leading H1 as the note
 * title so it can share the daily-subject typography while ordinary body H1s
 * keep prose heading styles. The ghost is anchored to the document, not the
 * caret: it stays while the user writes the body, a standing reminder that
 * the note is still unnamed (text styled by `.reflect-title-placeholder`).
 */

/**
 * The document range the ghost decorates — the first node, when it is an
 * empty H1 (the title position) — or `null` when the note is titled or
 * doesn't lead with a heading.
 */
export function titlePlaceholderRange(
  doc: ProseMirrorNode,
): { from: number; to: number } | null {
  const range = titleHeadingRange(doc)
  return range !== null && range.isEmpty ? { from: range.from, to: range.to } : null
}

function titleHeadingRange(
  doc: ProseMirrorNode,
): { from: number; to: number; isEmpty: boolean } | null {
  const first = doc.firstChild
  const isTitle = first !== null && first.type.name === 'heading' && first.attrs.level === 1
  return isTitle ? { from: 0, to: first.nodeSize, isEmpty: first.content.size === 0 } : null
}

/** Mark the leading H1 as a note title and ghost `placeholder` when it is empty. */
export function defineTitlePlaceholder(placeholder: string): PlainExtension {
  return definePlugin(
    new Plugin({
      key: new PluginKey('reflect-title-placeholder'),
      props: {
        decorations: (state) => {
          const range = titleHeadingRange(state.doc)
          if (range === null) {
            return null
          }
          const attrs: { class: string; 'data-placeholder'?: string } = {
            class: range.isEmpty
              ? 'reflect-note-title reflect-title-placeholder'
              : 'reflect-note-title',
          }
          if (range.isEmpty) {
            attrs['data-placeholder'] = placeholder
          }
          return DecorationSet.create(state.doc, [
            Decoration.node(range.from, range.to, attrs),
          ])
        },
      },
    }),
  )
}
