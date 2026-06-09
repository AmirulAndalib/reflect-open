import { definePlugin, union, type PlainExtension } from '@prosekit/core'
import { Plugin, PluginKey, type EditorState } from '@prosekit/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@prosekit/pm/view'
import { scanInlineImages } from '@reflect/core'

/**
 * Inline images for the editor (Plan 05b step 7).
 *
 * Like wiki links, `![alt](src)` stays **literal markdown text** in the
 * document — fidelity by construction — and the actual image renders as a
 * *widget decoration* appended after the text block. Detection reuses the
 * canonical grammar (`scanInlineImages`), so images inside code stay literal.
 *
 * Pasting/dropping an image file goes the other way: the injected `saveImage`
 * writes the bytes into the graph's `assets/` (Plan 02 primitive) and the
 * editor inserts the relative markdown reference at the caret.
 */

export interface ImageOptions {
  /**
   * Resolve a markdown `src` to a displayable URL: `http(s)` passes through,
   * graph-relative `assets/…` becomes an asset-protocol URL, anything else
   * returns `null` (not rendered).
   */
  resolveUrl: (src: string) => string | null
  /**
   * Persist a pasted/dropped image file into the graph and return its
   * graph-relative path (or `null` to decline). Optional — without it,
   * paste/drop of images falls through to the default behavior.
   */
  saveImage?: (file: File) => Promise<string | null>
}

const imageKey = new PluginKey<DecorationSet>('reflect-images')

/** A renderable image found in the document. Exported for tests. */
export interface ImageRange {
  /** Position right after the containing block (where the widget mounts). */
  widgetAt: number
  alt: string
  src: string
}

/** Compute every renderable image in the document. Pure over the editor state. */
export function computeImageRanges(state: EditorState): ImageRange[] {
  const ranges: ImageRange[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.spec.code) {
      return false
    }
    if (!node.isTextblock) {
      return true
    }
    if (node.childCount === 0) {
      return false
    }
    let allText = true
    node.forEach((child) => {
      if (!child.isText) {
        allText = false
      }
    })
    if (!allText) {
      return false
    }
    for (const image of scanInlineImages(node.textContent)) {
      // The widget sits at the block's end position (inside the block), so it
      // renders directly beneath the literal markdown line.
      ranges.push({ widgetAt: pos + node.nodeSize - 1, alt: image.alt, src: image.src })
    }
    return false
  })
  return ranges
}

function buildImageDecorations(state: EditorState, options: ImageOptions): DecorationSet {
  const decorations: Decoration[] = []
  for (const range of computeImageRanges(state)) {
    const url = options.resolveUrl(range.src)
    if (!url) {
      continue
    }
    decorations.push(
      Decoration.widget(
        range.widgetAt,
        () => {
          const figure = document.createElement('div')
          figure.className = 'md-image'
          figure.contentEditable = 'false'
          const img = document.createElement('img')
          img.src = url
          img.alt = range.alt
          img.draggable = false
          figure.appendChild(img)
          return figure
        },
        // Keyed so ProseMirror reuses the DOM node (no <img> reload flicker)
        // while the underlying markdown is unchanged.
        { key: `md-image:${url}`, side: 1 },
      ),
    )
  }
  return DecorationSet.create(state.doc, decorations)
}

function createImageRenderPlugin(options: ImageOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: imageKey,
    state: {
      init: (_, state) => buildImageDecorations(state, options),
      apply: (tr, value, _oldState, newState) =>
        tr.docChanged ? buildImageDecorations(newState, options) : value,
    },
    props: {
      decorations: (state) => imageKey.getState(state),
    },
  })
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return []
  }
  return Array.from(data.files).filter((file) => file.type.startsWith('image/'))
}

function insertSavedImages(
  view: EditorView,
  files: File[],
  saveImage: (file: File) => Promise<string | null>,
  at?: number,
): void {
  void (async () => {
    for (const file of files) {
      let saved: string | null
      try {
        saved = await saveImage(file)
      } catch (err) {
        console.error('failed to save pasted image:', err)
        continue
      }
      if (saved === null || view.isDestroyed) {
        continue
      }
      const markdown = `![](${saved})`
      const tr =
        at !== undefined
          ? view.state.tr.insertText(markdown, at)
          : view.state.tr.insertText(markdown)
      view.dispatch(tr)
      if (at !== undefined) {
        // Chain subsequent drops after the one just inserted (the drop point
        // doesn't move the selection, so falling back to the caret would put
        // later files at the wrong place).
        at += markdown.length
      }
    }
  })()
}

function createImageInputPlugin(options: ImageOptions): Plugin {
  return new Plugin({
    props: {
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData)
        if (files.length === 0 || !options.saveImage) {
          return false
        }
        insertSavedImages(view, files, options.saveImage)
        return true
      },
      handleDrop: (view, event) => {
        const files = imageFiles(event.dataTransfer)
        if (files.length === 0 || !options.saveImage) {
          return false
        }
        const drop = view.posAtCoords({ left: event.clientX, top: event.clientY })
        insertSavedImages(view, files, options.saveImage, drop?.pos)
        return true
      },
    },
  })
}

/** The image extension (render + paste/drop), composed via `union`. */
export function defineImages(options: ImageOptions): PlainExtension {
  return union(
    definePlugin(createImageRenderPlugin(options)),
    definePlugin(createImageInputPlugin(options)),
  ) as PlainExtension
}
