/**
 * TEMPORARY instrumentation for the iOS day-carousel horizontal drift bug
 * (the carousel viewport ends up with a nonzero `scrollLeft` after a caret
 * reveal). Every line is prefixed `[drift` so Safari Web Inspector can filter
 * on "drift". Remove this file and every `drift-probe` import before merging.
 *
 * What it captures:
 * - every JS write to any element's `scrollLeft` (with the writer's stack),
 *   via an `Element.prototype` setter trap — this is how ProseMirror's
 *   `scrollRectIntoView` scrolls ancestors;
 * - every DOM `scrollIntoView()` call and `window.scrollBy()` call (stacks);
 * - `scroll` events on the carousel viewport (fires for UA-internal scrolls
 *   too, which bypass the JS setter — that difference tells PM from WebKit);
 * - a 500ms sentinel that shouts when the viewport's `scrollLeft` changed
 *   without any of the above being seen;
 * - helpers the instrumented call sites use to log caret geometry and to diff
 *   ancestor scroll offsets around a reveal dispatch.
 *
 * Console helpers (type in the Web Inspector console):
 * - `__drift.status()` — viewport scrollLeft/ratio, transform, mounted slides
 * - `__drift.reset()`  — zero the viewport + slide containers (heal the UI)
 */

let viewport: HTMLElement | null = null
let sentinelScrollLeft = 0
let selectedDay = '<unknown>'
let installed = false

const t0 = Date.now()

function now(): string {
  return ((Date.now() - t0) / 1000).toFixed(3)
}

export function driftLog(tag: string, data?: unknown): void {
  if (data === undefined) {
    console.warn(`[drift +${now()}s] ${tag}`)
  } else {
    console.warn(`[drift +${now()}s] ${tag}`, data)
  }
}

function stack(): string {
  return new Error('trace').stack ?? '<no stack>'
}

export function describeEl(el: Element | null): string {
  if (el === null) {
    return '<null>'
  }
  const id = el.id ? `#${el.id}` : ''
  const cls =
    typeof el.className === 'string' && el.className !== ''
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : ''
  const day = el.getAttribute('data-day')
  return `${el.tagName.toLowerCase()}${id}${cls}${day === null ? '' : `[data-day=${day}]`}`
}

/** The day the carousel currently centers, reported by `useDayCarousel`. */
export function reportSelectedDay(day: string): void {
  if (day !== selectedDay) {
    driftLog('selected day is now', { day })
    selectedDay = day
  }
}

interface ScrollSnapshotEntry {
  el: Element
  desc: string
  scrollLeft: number
  scrollTop: number
  scrollWidth: number
  clientWidth: number
}

/** Snapshot `start` and every ancestor's scroll offsets, for a later diff. */
export function snapshotScrollAncestors(start: Element): ScrollSnapshotEntry[] {
  const entries: ScrollSnapshotEntry[] = []
  for (let el: Element | null = start; el !== null; el = el.parentElement) {
    entries.push({
      el,
      desc: describeEl(el),
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    })
  }
  return entries
}

/** Log which snapshotted elements' scroll offsets changed since the snapshot. */
export function logScrollAncestorsDiff(before: ScrollSnapshotEntry[], label: string): void {
  const changes = before
    .filter((e) => e.el.scrollLeft !== e.scrollLeft || e.el.scrollTop !== e.scrollTop)
    .map((e) => ({
      el: e.desc,
      scrollLeft: `${e.scrollLeft} -> ${e.el.scrollLeft}`,
      scrollTop: `${e.scrollTop} -> ${e.el.scrollTop}`,
      scrollWidth: e.scrollWidth,
      clientWidth: e.clientWidth,
    }))
  if (changes.length === 0) {
    driftLog(`${label}: dispatch scrolled nothing`)
  } else {
    driftLog(`${label}: dispatch scrolled`, changes)
  }
}

/** The slice of ProseMirror's `EditorView` the caret report reads. */
export interface CaretViewLike {
  dom: HTMLElement
  composing: boolean
  state: { selection: { head: number; empty: boolean } }
  hasFocus: () => boolean
  coordsAtPos: (pos: number, side: number) => {
    left: number
    right: number
    top: number
    bottom: number
  }
}

/**
 * Everything relevant about the caret at reveal time: which day's editor it
 * sits in vs which day the carousel shows, and whether its rect is outside
 * the screen horizontally (`overRight`/`overLeft` positive = offscreen px).
 */
export function caretDebugInfo(view: CaretViewLike): Record<string, unknown> {
  let caret: Record<string, number> | string
  try {
    const c = view.coordsAtPos(view.state.selection.head, 1)
    caret = {
      left: Math.round(c.left),
      right: Math.round(c.right),
      top: Math.round(c.top),
      bottom: Math.round(c.bottom),
      overRight: Math.round(c.right - window.innerWidth),
      overLeft: Math.round(-c.left),
    }
  } catch (err) {
    caret = `coordsAtPos threw: ${String(err)}`
  }
  const editorRect = view.dom.getBoundingClientRect()
  const vv = window.visualViewport
  return {
    editorDay: view.dom.closest('[data-day]')?.getAttribute('data-day') ?? '<not in a day slide>',
    selectedDay,
    head: view.state.selection.head,
    empty: view.state.selection.empty,
    hasFocus: view.hasFocus(),
    composing: view.composing,
    caret,
    editorRect: { left: Math.round(editorRect.left), right: Math.round(editorRect.right) },
    windowInnerWidth: window.innerWidth,
    visualViewport: vv
      ? { width: Math.round(vv.width), offsetLeft: Math.round(vv.offsetLeft), scale: vv.scale }
      : null,
    keyboardHeightVar: document.documentElement.style.getPropertyValue('--keyboard-height'),
    activeElement: describeEl(document.activeElement),
    viewportScrollLeft: viewport?.scrollLeft ?? '<viewport not attached>',
  }
}

/** Wire the day-carousel's Embla viewport into the probe (from its ref). */
export function attachDriftViewport(el: HTMLElement | null): void {
  if (el === null || el === viewport) {
    return
  }
  viewport = el
  sentinelScrollLeft = el.scrollLeft
  driftLog('carousel viewport attached', {
    desc: describeEl(el),
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    scrollLeft: el.scrollLeft,
  })
  // Fires for user, JS and UA-internal scrolls alike (async, after the fact).
  // A `scroll event` line with no preceding `scrollLeft write` line means the
  // writer was NOT JavaScript (WebKit scrolled it natively).
  el.addEventListener(
    'scroll',
    () => {
      driftLog('carousel viewport scroll event', {
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      })
    },
    { passive: true },
  )
}

function mountedSlides(): Array<Record<string, unknown>> {
  if (viewport === null) {
    return []
  }
  return [...viewport.querySelectorAll('[data-day]')]
    .filter((slide) => slide.firstElementChild !== null)
    .map((slide) => ({
      day: slide.getAttribute('data-day'),
      slideLeft: Math.round(slide.getBoundingClientRect().left),
      containerScrollLeft: slide.firstElementChild?.scrollLeft ?? null,
      containerScrollWidth: slide.firstElementChild?.scrollWidth ?? null,
      containerClientWidth: slide.firstElementChild?.clientWidth ?? null,
    }))
}

interface DriftGlobal {
  status: () => void
  reset: () => void
}

declare global {
  interface Window {
    __drift?: DriftGlobal
  }
}

/**
 * Install the global traps and the sentinel. Called once from `MobileApp`
 * (mobile-only, so the desktop app never sees the patched prototypes).
 */
export function installDriftProbe(): void {
  if (installed) {
    return
  }
  installed = true
  driftLog('probe installed', {
    ua: navigator.userAgent,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
  })

  // --- Trap 1: every JS write to any element's scrollLeft, with stack. ---
  // ProseMirror's scrollRectIntoView does `elt.scrollLeft += moveX`, so a
  // horizontal reveal lands here with `scrollRectIntoView` in the stack.
  const proto = Element.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollLeft')
  if (desc?.get && desc.set) {
    const { get, set } = desc
    Object.defineProperty(proto, 'scrollLeft', {
      configurable: true,
      enumerable: desc.enumerable ?? true,
      get(this: Element): number {
        return get.call(this) as number
      },
      set(this: Element, value: number) {
        const before = get.call(this) as number
        set.call(this, value)
        const after = get.call(this) as number
        // Log writes that did something, tried to do something, or hit the
        // carousel viewport; silent no-op writes elsewhere stay quiet.
        if (this === viewport || before !== after || value !== before) {
          driftLog('scrollLeft write', {
            target: describeEl(this),
            isCarouselViewport: this === viewport,
            requested: Math.round(value),
            before: Math.round(before),
            after: Math.round(after),
            stack: stack(),
          })
        }
      },
    })
  } else {
    driftLog('scrollLeft trap NOT installed (no accessor on Element.prototype)')
  }

  // --- Trap 2: DOM scrollIntoView calls (a non-PM writer would show here). ---
  const originalScrollIntoView = proto.scrollIntoView
  proto.scrollIntoView = function scrollIntoViewProbe(
    this: Element,
    arg?: boolean | ScrollIntoViewOptions,
  ): void {
    driftLog('Element.scrollIntoView call', { target: describeEl(this), arg, stack: stack() })
    originalScrollIntoView.call(this, arg)
  }

  // --- Trap 3: window.scrollBy — PM's reveal uses it at the top of the chain. ---
  const originalScrollBy = window.scrollBy.bind(window) as (
    ...args: [ScrollToOptions] | [number, number]
  ) => void
  window.scrollBy = function scrollByProbe(
    ...args: [ScrollToOptions] | [number, number]
  ): void {
    driftLog('window.scrollBy call', { args, stack: stack() })
    originalScrollBy(...args)
  } as typeof window.scrollBy

  // --- Sentinel: catch drift whose writer none of the traps saw. ---
  window.setInterval(() => {
    if (viewport === null) {
      return
    }
    const x = viewport.scrollLeft
    if (x !== sentinelScrollLeft) {
      driftLog('SENTINEL: viewport scrollLeft changed', {
        from: Math.round(sentinelScrollLeft),
        to: Math.round(x),
        clientWidth: viewport.clientWidth,
        ratioOfScreen: Number((x / viewport.clientWidth).toFixed(3)),
        selectedDay,
        activeElement: describeEl(document.activeElement),
      })
      sentinelScrollLeft = x
    }
  }, 500)

  window.__drift = {
    status: () => {
      if (viewport === null) {
        driftLog('status: viewport not attached yet')
        return
      }
      driftLog('status', {
        viewportScrollLeft: viewport.scrollLeft,
        clientWidth: viewport.clientWidth,
        scrollWidth: viewport.scrollWidth,
        ratioOfScreen: Number((viewport.scrollLeft / viewport.clientWidth).toFixed(3)),
        beltTransform: (viewport.firstElementChild as HTMLElement | null)?.style.transform,
        selectedDay,
        keyboardHeightVar: document.documentElement.style.getPropertyValue('--keyboard-height'),
        activeElement: describeEl(document.activeElement),
        mountedSlides: mountedSlides(),
      })
    },
    reset: () => {
      if (viewport === null) {
        return
      }
      viewport.scrollLeft = 0
      for (const slide of viewport.querySelectorAll('[data-day]')) {
        if (slide.firstElementChild !== null) {
          slide.firstElementChild.scrollLeft = 0
        }
      }
      driftLog('manual reset done', { viewportScrollLeft: viewport.scrollLeft })
    },
  }
}
