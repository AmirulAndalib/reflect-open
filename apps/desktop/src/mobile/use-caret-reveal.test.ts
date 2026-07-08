import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REVEAL_WINDOW_MS, useCaretReveal } from './use-caret-reveal'

/**
 * The end-of-note reveal in isolation (extracted from DaySlide). jsdom has no
 * layout, so the caret scroll is a recording spy and the ResizeObserver is
 * hand-fired — the same harness as use-scroll-restore. The contract under
 * test: the double-tap's caret lands at the note's end before the iOS
 * keyboard reports its height (and before a long note's images size in), so
 * the reveal must keep asking the editor to scroll the caret back into view
 * as the layout churns, then get out of the user's way.
 */

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []

  readonly observed: Element[] = []
  disconnected = false

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.push(target)
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true
  }

  takeRecords(): [] {
    return []
  }

  /** Simulate a resize notification (real observers go quiet once disconnected). */
  resize(): void {
    if (!this.disconnected) {
      this.callback([], this as unknown as ResizeObserver)
    }
  }
}

/** The single observer the active reveal created, or `undefined`. */
function observer(): FakeResizeObserver | undefined {
  return FakeResizeObserver.instances[0]
}

function mountReveal() {
  const container = document.createElement('div')
  const content = document.createElement('div')
  container.appendChild(content)
  const containerRef = { current: container }
  const contentRef = { current: content }
  const scrollCaretIntoView = vi.fn()
  const hook = renderHook(() =>
    useCaretReveal({ containerRef, contentRef, scrollCaretIntoView }),
  )
  return { container, content, scrollCaretIntoView, hook }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useCaretReveal', () => {
  it('reveals the caret immediately and re-reveals as the layout changes', () => {
    const { container, content, scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
    expect(observer()?.observed).toContain(container)
    expect(observer()?.observed).toContain(content)

    // The keyboard raises: the shell (and the container) shrink by its
    // height, dropping an end-of-note caret under the keyboard. Late content
    // growth (images sizing in) fires the same observer.
    observer()?.resize()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(2)
  })

  it('re-reveals when something scrolls the container without a resize', () => {
    const { container, scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    // iOS WebKit scrolls the container directly to reveal the newly focused
    // editor — no size change, so the observer never fires. The user's own
    // take-over always leads with a pointerdown, so a bare scroll is never
    // the user's.
    container.dispatchEvent(new Event('scroll'))
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(2)
  })

  it('stops chasing scrolls once the reveal ends', () => {
    const { container, scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    container.dispatchEvent(new Event('pointerdown'))
    container.dispatchEvent(new Event('scroll'))
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
  })

  it('ends the reveal after a quiet window — later churn leaves the user alone', () => {
    const { scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    vi.advanceTimersByTime(REVEAL_WINDOW_MS)
    expect(observer()?.disconnected).toBe(true)

    observer()?.resize()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
  })

  it('re-arms the quiet window on each disturbance, covering churn past one window', () => {
    const { scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    // A long note's images keep sizing in: each growth lands inside the
    // current window and re-arms it, so the reveal outlives a single fixed
    // window while the layout is still moving.
    vi.advanceTimersByTime(REVEAL_WINDOW_MS - 100)
    observer()?.resize()
    vi.advanceTimersByTime(REVEAL_WINDOW_MS - 100)
    expect(observer()?.disconnected).toBe(false)
    observer()?.resize()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(REVEAL_WINDOW_MS)
    expect(observer()?.disconnected).toBe(true)
  })

  it('hands control to the user on pointerdown', () => {
    const { container, scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    container.dispatchEvent(new Event('pointerdown'))
    expect(observer()?.disconnected).toBe(true)

    observer()?.resize()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
  })

  it('restarts the reveal when called again, replacing the old one', () => {
    const { scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    const first = observer()
    hook.result.current.revealEnd()
    expect(first?.disconnected).toBe(true)
    expect(FakeResizeObserver.instances).toHaveLength(2)

    FakeResizeObserver.instances[1]?.resize()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(3)
  })

  it('cancelReveal ends an active reveal without touching the scroll position', () => {
    const { scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
    hook.result.current.cancelReveal()
    expect(observer()?.disconnected).toBe(true)

    // An explicit jump-to-top after the cancel must stick: no late re-reveal
    // when the keyboard dismisses or content grows, and no live deadline.
    observer()?.resize()
    vi.advanceTimersByTime(REVEAL_WINDOW_MS)
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
  })

  it('stops the reveal on unmount', () => {
    const { scrollCaretIntoView, hook } = mountReveal()

    hook.result.current.revealEnd()
    hook.unmount()
    expect(observer()?.disconnected).toBe(true)

    observer()?.resize()
    expect(scrollCaretIntoView).toHaveBeenCalledTimes(1)
  })
})
