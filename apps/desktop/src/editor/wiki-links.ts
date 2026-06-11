import { definePlugin, type PlainExtension } from '@prosekit/core'
import { Plugin, PluginKey, type EditorState } from '@prosekit/pm/state'
import { scanInlineWikiLinks } from '@reflect/core'

/**
 * Click-to-navigate for `[[wiki link]]`s (Plan 05).
 *
 * Rendering is the engine's job since meowdown 0.3.0: its inline pass parses
 * wikilinks into native marks (`.md-wikilink`, with the `[[` `]]` brackets as
 * syntax marks the MarkMode reveal contract handles), so the decoration layer
 * this module used to carry is gone. What remains is the one behavior the
 * engine doesn't ship: resolving a click on a link into app navigation.
 * Target detection reuses the canonical wiki-link grammar via
 * `scanInlineWikiLinks` (shared with the indexer), so clicks and index links
 * always agree — including alias handling (`[[target|alias]]` navigates to
 * `target`) and `[[…]]` inside code staying inert.
 */

const wikiLinkKey = new PluginKey('reflect-wiki-links')

export interface WikiLinkOptions {
  /**
   * Called with the link target on click. Links act like links: a plain click
   * navigates. The exception is a link the caret is already inside (syntax
   * revealed, being edited) — there a plain click places the caret so the
   * text stays mouse-editable, and Mod+click still navigates.
   * Resolution/navigation is the caller's job.
   */
  onNavigate?: (target: string) => void
}

/** One wiki link in document positions, spanning the whole `[[…]]`. */
export interface WikiLinkHit {
  from: number
  to: number
  target: string
}

/** The wiki link containing document position `pos`, if any. Pure; exported for tests. */
export function wikiLinkAt(state: EditorState, pos: number): WikiLinkHit | null {
  const $pos = state.doc.resolve(pos)
  const block = $pos.parent
  if (!block.isTextblock || block.type.spec.code) {
    return null
  }
  // Offsets into textContent map 1:1 onto positions only while every inline
  // child is text (meowdown's schema today). A non-text inline leaf (e.g. a
  // future image node) would shift positions — skip the block defensively.
  let allText = true
  block.forEach((child) => {
    if (!child.isText) {
      allText = false
    }
  })
  if (!allText) {
    return null
  }

  const base = $pos.start()
  const offset = pos - base
  for (const link of scanInlineWikiLinks(block.textContent)) {
    if (link.from <= offset && offset <= link.to) {
      return { from: base + link.from, to: base + link.to, target: link.target }
    }
  }
  return null
}

/** The selection as it stood at mousedown, before the click moved the caret. */
interface SelectionSnapshot {
  from: number
  to: number
  empty: boolean
}

/**
 * Whether a plain click at `pos` should edit (place the caret) rather than
 * navigate: true when the pre-click caret already sat inside the clicked
 * link — the syntax-revealed state, the user is editing it. The snapshot
 * must be taken at mousedown: by the time the click handler runs, the
 * browser has already moved the caret to the clicked position, so the
 * live selection always looks "inside the link". Pure; exported for tests.
 */
export function clickEditsLink(
  state: EditorState,
  pos: number,
  selectionBefore: SelectionSnapshot | null,
): boolean {
  if (!selectionBefore || !selectionBefore.empty) {
    return false
  }
  const link = wikiLinkAt(state, pos)
  return link !== null && selectionBefore.from >= link.from && selectionBefore.to <= link.to
}

/** The click-handling plugin. Exported for tests. */
export function createWikiLinkPlugin(options: WikiLinkOptions): Plugin {
  let selectionBeforeClick: SelectionSnapshot | null = null

  return new Plugin({
    key: wikiLinkKey,
    props: {
      handleDOMEvents: {
        mousedown: (view) => {
          const { from, to, empty } = view.state.selection
          selectionBeforeClick = { from, to, empty }
          return false
        },
      },
      handleClick: (view, pos, event) => {
        if (!options.onNavigate) {
          return false
        }
        // Require a physical click on the rendered link: `pos` alone also
        // matches clicks in the blank space past a line that resolve into it.
        const onLink = (event.target as HTMLElement | null)?.closest?.('.md-wikilink')
        if (!onLink) {
          return false
        }
        const link = wikiLinkAt(view.state, pos)
        if (!link) {
          return false
        }
        const modClick = event.metaKey || event.ctrlKey
        if (!modClick && clickEditsLink(view.state, pos, selectionBeforeClick)) {
          return false
        }
        options.onNavigate(link.target)
        return true
      },
    },
  })
}

/** The wiki-link navigation extension, composed into the editor via `union`. */
export function defineWikiLinks(options: WikiLinkOptions = {}): PlainExtension {
  return definePlugin(createWikiLinkPlugin(options))
}
