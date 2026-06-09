import { definePlugin, type PlainExtension } from '@prosekit/core'
import { Plugin, PluginKey, type EditorState } from '@prosekit/pm/state'
import { Decoration, DecorationSet } from '@prosekit/pm/view'
import { scanInlineWikiLinks } from '@reflect/core'

/**
 * `[[wiki link]]` chips for the editor (Plan 05), as **view decorations** over
 * the literal markdown text.
 *
 * Why decorations and not a mark/node: meowdown's inline pass recomputes each
 * block's marks from its own Lezer parse on every text change and strips any
 * mark not in its computed set — a custom mark would be removed (or fight the
 * engine with ping-ponging appendTransactions). Decorations never touch the
 * document, so serialization stays byte-identical by construction and there is
 * nothing for the engine to strip. Detection reuses the canonical wiki-link
 * grammar via `scanInlineWikiLinks` (shared with the indexer), so chips and
 * index links always agree — including `[[…]]` inside code staying literal.
 *
 * DOM contract (styled in the app stylesheet, mirroring meowdown's md-mark):
 * - the whole `[[…]]` span: `.md-wiki-link` (+ `data-wiki-target`)
 * - the syntax portions (brackets, `target|` when aliased): `.md-wiki-mark`,
 *   given `.show` when the caret is inside the link — the same reveal contract
 *   meowdown's MarkMode uses, so `data-mark-mode` CSS treats both alike.
 */

const wikiLinkKey = new PluginKey<DecorationSet>('reflect-wiki-links')

export interface WikiLinkOptions {
  /**
   * Called with the link target on Mod+click (plain click places the caret, as
   * in any live-preview editor). Resolution/navigation is the caller's job.
   */
  onNavigate?: (target: string) => void
}

/** One decorated range, in document positions. Exported for tests. */
export interface WikiLinkRange {
  from: number
  to: number
  /** `chip` spans the whole `[[…]]`; `mark` spans a syntax portion of it. */
  kind: 'chip' | 'mark'
  target: string
  /** True when the caret is inside the link (syntax revealed). */
  active: boolean
}

/** Compute every wiki-link range in the document. Pure over the editor state. */
export function computeWikiLinkRanges(state: EditorState): WikiLinkRange[] {
  const ranges: WikiLinkRange[] = []
  const { from: caretFrom, to: caretTo, empty } = state.selection

  state.doc.descendants((node, pos) => {
    if (node.type.spec.code) {
      return false // never decorate inside code blocks
    }
    if (!node.isTextblock) {
      return true
    }
    if (node.childCount === 0) {
      return false
    }
    // Offsets into textContent map 1:1 onto positions only while every inline
    // child is text (meowdown's schema today). A non-text inline leaf (e.g. a
    // future image node) would shift positions — skip the block defensively.
    let allText = true
    node.forEach((child) => {
      if (!child.isText) {
        allText = false
      }
    })
    if (!allText) {
      return false
    }

    const base = pos + 1
    for (const link of scanInlineWikiLinks(node.textContent)) {
      const from = base + link.from
      const to = base + link.to
      // Reveal syntax only for an empty selection (caret) touching the link,
      // matching meowdown's MarkMode focus behavior.
      const active = empty && caretFrom >= from && caretTo <= to
      ranges.push({ from, to, kind: 'chip', target: link.target, active })
      ranges.push({
        from,
        to: base + link.displayFrom,
        kind: 'mark',
        target: link.target,
        active,
      })
      ranges.push({
        from: base + link.displayTo,
        to,
        kind: 'mark',
        target: link.target,
        active,
      })
    }
    return false
  })

  return ranges
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations = computeWikiLinkRanges(state).map((range) => {
    if (range.kind === 'chip') {
      return Decoration.inline(range.from, range.to, {
        class: `md-wiki-link${range.active ? ' is-active' : ''}`,
        'data-wiki-target': range.target,
      })
    }
    return Decoration.inline(range.from, range.to, {
      class: `md-wiki-mark${range.active ? ' show' : ''}`,
    })
  })
  return DecorationSet.create(state.doc, decorations)
}

function createWikiLinkPlugin(options: WikiLinkOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: wikiLinkKey,
    state: {
      init: (_, state) => buildDecorations(state),
      apply: (tr, value, _oldState, newState) => {
        if (!tr.docChanged && !tr.selectionSet) {
          return value
        }
        // Full recompute: scanning is cheap (a `[[` pre-filter per block) and
        // notes are small; revisit with incremental mapping if profiling says so.
        return buildDecorations(newState)
      },
    },
    props: {
      decorations: (state) => wikiLinkKey.getState(state),
      handleClick: (_view, _pos, event) => {
        if (!options.onNavigate || !(event.metaKey || event.ctrlKey)) {
          return false
        }
        // The chip decoration carries the target; read it off the clicked span.
        const target = (event.target as HTMLElement | null)
          ?.closest?.('[data-wiki-target]')
          ?.getAttribute('data-wiki-target')
        if (!target) {
          return false
        }
        options.onNavigate(target)
        return true
      },
    },
  })
}

/** The wiki-link chip extension, composed into the editor via `union`. */
export function defineWikiLinks(options: WikiLinkOptions = {}): PlainExtension {
  return definePlugin(createWikiLinkPlugin(options))
}
