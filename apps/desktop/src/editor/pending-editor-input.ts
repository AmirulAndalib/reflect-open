import type { EditorHandle } from '@meowdown/react'

interface FlushableDomObserver {
  forceFlush?(): void
  flush(): void
}

function isFlushableDomObserver(value: unknown): value is FlushableDomObserver {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const forceFlush: unknown = Reflect.get(value, 'forceFlush')
  return (
    typeof Reflect.get(value, 'flush') === 'function' &&
    (forceFlush === undefined || typeof forceFlush === 'function')
  )
}

/**
 * Synchronize the editor state with pending native DOM mutations.
 *
 * ProseMirror 1.42 deliberately delays mutation records captured during blur
 * by 20ms. Its observer is not part of the typed public API, so this narrow
 * reflective boundary keeps the dependency reach-in isolated and degrades to
 * a no-op if the implementation changes. Meowdown owns the long-term API;
 * Reflect still needs a synchronous persistence barrier in the meantime.
 */
function flushPendingEditorDom(handle: EditorHandle | null): boolean {
  const editor = handle?.editor
  if (editor === undefined || editor.view.isDestroyed) {
    return false
  }
  const previous = editor.state.doc
  const observer: unknown = Reflect.get(editor.view, 'domObserver')
  if (!isFlushableDomObserver(observer)) {
    return false
  }
  // `flushSoon()` blocks a plain `flush()` until its 20ms timer fires, while
  // `stop()` (the blur path) queues records behind a different untracked
  // timer. `forceFlush()` handles the former; the following `flush()` drains
  // the latter. Calling both is therefore intentional.
  observer.forceFlush?.()
  observer.flush()
  return !editor.state.doc.eq(previous)
}

/** Flush pending native input, then serialize the editor's settled document. */
export function settledEditorMarkdown(handle: EditorHandle | null): string {
  flushPendingEditorDom(handle)
  return handle?.getMarkdown() ?? ''
}

/** Return the settled document only when flushing native input changed it. */
export function commitPendingEditorInput(handle: EditorHandle | null): string | null {
  return flushPendingEditorDom(handle) ? (handle?.getMarkdown() ?? '') : null
}
