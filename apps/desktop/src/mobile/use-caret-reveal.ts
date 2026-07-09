import { useCallback, useEffect, useRef, type RefObject } from 'react'

/** How long a reveal outlives the *last* layout disturbance before handing
 *  the scroll back to the user. The iOS keyboard raise (and the shell
 *  shrinking by its height) settles well within a second; each container
 *  resize, content growth, or stray scroll re-arms the window, so churn
 *  that outlasts one window (a long note's images sizing in late) is still
 *  covered. */
export const REVEAL_WINDOW_MS = 1500

export interface CaretRevealOptions {
  /** The scroll container whose disturbances re-reveal the caret. */
  containerRef: RefObject<HTMLElement | null>
  /** The container's content, observed so late growth re-reveals too. */
  contentRef: RefObject<HTMLElement | null>
  /**
   * Scroll the editor caret into view if it left the visible area — a no-op
   * while it is visible ({@link NoteEditorHandle.scrollIntoView} semantics).
   */
  scrollCaretIntoView: () => void
}

export interface CaretReveal {
  /**
   * Scroll the caret into view now and keep re-revealing it while the layout
   * settles. The reveal ends when the user touches the container
   * (pointerdown), the layout goes quiet for {@link REVEAL_WINDOW_MS}, or
   * the component unmounts; calling it again restarts the reveal.
   */
  revealEnd: () => void
  /**
   * End an active reveal without touching the scroll position. An explicit
   * re-anchor (the slide's jump-to-top) must call this first — a live reveal
   * would otherwise re-reveal the caret on the next resize and undo it.
   */
  cancelReveal: () => void
}

/**
 * Keeps an end-of-note caret visible through the iOS keyboard raise and late
 * layout growth. The editor's own scroll-into-view runs once at focus time —
 * against the full-height viewport — but the keyboard reports its height only
 * once it animates up, and the shell then shrinks by that height (Plan 19,
 * decision 8); a long note also keeps growing after focus as images and file
 * pills size in. Both push the caret out of the viewport with nothing
 * re-scrolling. A reveal asks the editor to scroll the caret back into view
 * on every container resize (the keyboard raise, a rotation), content growth,
 * or stray scroll, each of which re-arms the quiet window, until the window
 * closes or the user takes over.
 */
export function useCaretReveal({
  containerRef,
  contentRef,
  scrollCaretIntoView,
}: CaretRevealOptions): CaretReveal {
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), [])

  const revealEnd = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (container === null || content === null) {
      return
    }
    stopRef.current?.()
    let observer: ResizeObserver | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null
    const stop = (): void => {
      if (stopRef.current === stop) {
        stopRef.current = null
      }
      if (deadline !== null) {
        clearTimeout(deadline)
      }
      observer?.disconnect()
      container.removeEventListener('pointerdown', stop)
      container.removeEventListener('scroll', reveal)
    }
    const reveal = (): void => {
      if (deadline !== null) {
        clearTimeout(deadline)
      }
      deadline = setTimeout(stop, REVEAL_WINDOW_MS)
      scrollCaretIntoView()
    }
    stopRef.current = stop
    reveal()
    observer = new ResizeObserver(reveal)
    observer.observe(container)
    observer.observe(content)
    container.addEventListener('pointerdown', stop, { passive: true })
    // Anything that scrolls the caret out of view mid-reveal loses. Sizes are
    // covered by the observer, but iOS WebKit may scroll the container
    // directly to reveal the newly focused editor — no resize involved. The
    // user's own take-over always leads with a pointerdown (which stops the
    // reveal above), so a scroll arriving here is never the user's.
    container.addEventListener('scroll', reveal, { passive: true })
  }, [containerRef, contentRef, scrollCaretIntoView])

  const cancelReveal = useCallback(() => {
    stopRef.current?.()
  }, [])

  return { revealEnd, cancelReveal }
}
