/**
 * App-global registry of the open notes' flush functions. Quit-time teardown
 * (window close, ⌘Q, webview unload) must persist every dirty buffer before
 * the webview dies, and React unmount effects don't run on quit — so each
 * mounted note document registers an awaitable flush here instead.
 */

type Flush = () => Promise<void>

const flushes = new Set<Flush>()

/** Register a note buffer's flush; returns its unregister. */
export function registerFlush(flush: Flush): () => void {
  flushes.add(flush)
  return () => {
    flushes.delete(flush)
  }
}

/**
 * Flush every registered buffer and settle once all writes have. A failing
 * flush is already surfaced per-note by the save pipeline, and teardown must
 * proceed past it to the other buffers — so rejections are absorbed, never
 * re-thrown.
 */
export async function flushAllNotes(): Promise<void> {
  await Promise.allSettled(Array.from(flushes, (flush) => flush()))
}
