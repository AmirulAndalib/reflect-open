import { definePlugin, type PlainExtension } from '@prosekit/core'
import type { Mark, Node as ProseMirrorNode } from '@prosekit/pm/model'
import { Plugin, PluginKey, type EditorState } from '@prosekit/pm/state'
import { Decoration, DecorationSet } from '@prosekit/pm/view'

/**
 * Click-to-navigate rendering for authored `#tags` in read-only markdown
 * previews. The indexer's tag grammar is intentionally small: a tag starts
 * after whitespace or the block start, begins with a letter, then continues
 * through letters, numbers, `/`, `_`, or `-`.
 */

const TAG_RE = /(^|\s)#(\p{L}[\p{L}\p{N}/_-]*)/gu
const tagKey = new PluginKey<DecorationSet>('reflect-tags')

export interface TagOptions {
  /** Called with the tag name, without the leading `#`. */
  onNavigate?: (tag: string) => void
}

export interface TagRange {
  from: number
  to: number
  tag: string
}

function isCodeMark(mark: Mark): boolean {
  return mark.type.name === 'code' || mark.type.spec.code === true
}

function inlineTextSegments(node: ProseMirrorNode): { text: string; excluded: boolean }[] | null {
  const segments: { text: string; excluded: boolean }[] = []
  let supported = true
  node.forEach((child) => {
    if (!child.isText) {
      supported = false
      return
    }
    segments.push({
      text: child.text ?? '',
      excluded: child.marks.some(isCodeMark),
    })
  })
  return supported ? segments : null
}

function excludedOffsets(segments: readonly { text: string; excluded: boolean }[]): TagRange[] {
  const ranges: TagRange[] = []
  let cursor = 0
  for (const segment of segments) {
    const next = cursor + segment.text.length
    if (segment.excluded) {
      ranges.push({ from: cursor, to: next, tag: '' })
    }
    cursor = next
  }
  return ranges
}

function inRange(offset: number, ranges: readonly Pick<TagRange, 'from' | 'to'>[]): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to)
}

/** Compute every clickable tag in a ProseMirror document. Pure for tests. */
export function computeTagRanges(state: EditorState): TagRange[] {
  const ranges: TagRange[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.spec.code) {
      return false
    }
    if (!node.isTextblock) {
      return true
    }
    const segments = inlineTextSegments(node)
    if (segments === null) {
      return false
    }
    const text = segments.map((segment) => segment.text).join('')
    const excluded = excludedOffsets(segments)
    const base = pos + 1
    for (const match of text.matchAll(TAG_RE)) {
      const hashOffset = (match.index ?? 0) + match[1].length
      if (inRange(hashOffset, excluded)) {
        continue
      }
      ranges.push({
        from: base + hashOffset,
        to: base + hashOffset + match[2].length + 1,
        tag: match[2],
      })
    }
    return false
  })
  return ranges
}

function buildTagDecorations(state: EditorState): DecorationSet {
  return DecorationSet.create(
    state.doc,
    computeTagRanges(state).map((range) =>
      Decoration.inline(range.from, range.to, {
        class: 'reflect-tag-link',
        'data-tag': range.tag,
      }),
    ),
  )
}

export function createTagPlugin(options: TagOptions): Plugin<DecorationSet> {
  const enabled = options.onNavigate !== undefined
  return new Plugin<DecorationSet>({
    key: tagKey,
    state: {
      init: (_, state) => (enabled ? buildTagDecorations(state) : DecorationSet.empty),
      apply: (tr, value, _oldState, newState) =>
        enabled && tr.docChanged ? buildTagDecorations(newState) : value,
    },
    props: {
      decorations: (state) => tagKey.getState(state),
      handleClick: (_view, _pos, event) => {
        if (!options.onNavigate) {
          return false
        }
        const tag = (event.target as HTMLElement | null)
          ?.closest?.('.reflect-tag-link')
          ?.getAttribute('data-tag')
        if (!tag) {
          return false
        }
        options.onNavigate(tag)
        return true
      },
    },
  })
}

export function defineTags(options: TagOptions = {}): PlainExtension {
  return definePlugin(createTagPlugin(options))
}
