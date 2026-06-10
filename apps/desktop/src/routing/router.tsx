import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { normalizeRoute, routesEqual, type Route } from './route'

/**
 * The app router (Plan 06): a history stack over typed {@link Route}s — no URL,
 * no dependency. `navigate` pushes (truncating any forward entries, like a
 * browser), `back`/`forward` move the cursor. Mount it per graph (keyed by the
 * graph root) so switching graphs starts a fresh history.
 *
 * Each history entry can carry a **scroll offset** (Plan 06b): views report
 * theirs via `saveScrollState` (a ref write — safe from scroll handlers, never
 * re-renders) and read `savedScroll()` after a back/forward restores an entry.
 */

interface RouterValue {
  route: Route
  /** Stable identity of the current history entry (changes on back/forward). */
  entryId: number
  /**
   * Increments on every `navigate` call — including a no-op re-navigation to
   * the current route — so views can re-anchor on explicit intent (e.g. ⌘D
   * while already on today re-scrolls the stream to today).
   */
  arrivalSeq: number
  navigate: (route: Route) => void
  back: () => void
  forward: () => void
  canBack: boolean
  canForward: boolean
  /** Record the active view's scroll offset on the current history entry. */
  saveScrollState: (offset: number) => void
  /** The current entry's recorded offset (present when revisited), or `null`. */
  savedScroll: () => number | null
}

const RouterContext = createContext<RouterValue | null>(null)

interface RouterProviderProps {
  /** The launch route; defaults to today (the daily note is the spine). */
  initialRoute?: Route
  children: ReactNode
}

interface HistoryEntry {
  /** Stable identity for scroll bookkeeping (indices shift on truncation). */
  id: number
  route: Route
}

interface HistoryState {
  stack: HistoryEntry[]
  index: number
}

export function RouterProvider({
  initialRoute = { kind: 'today' },
  children,
}: RouterProviderProps): ReactElement {
  const [history, setHistory] = useState<HistoryState>({
    stack: [{ id: 0, route: normalizeRoute(initialRoute) }],
    index: 0,
  })
  const [arrivalSeq, setArrivalSeq] = useState(0)
  const nextId = useRef(1)
  /** Scroll offsets by entry id — a ref so scroll reporting never re-renders. */
  const scrollById = useRef(new Map<number, number>())
  /** The active entry id, readable without depending on render order. */
  const currentId = useRef(0)
  currentId.current = history.stack[history.index].id

  const navigate = useCallback((route: Route) => {
    const target = normalizeRoute(route)
    setHistory((current) => {
      if (routesEqual(current.stack[current.index].route, target)) {
        // No stack growth — but this is still an explicit arrival: forget the
        // entry's saved offset so the view re-anchors to its target instead of
        // restoring the old scroll position.
        scrollById.current.delete(current.stack[current.index].id)
        return current
      }
      const dropped = current.stack.slice(current.index + 1)
      for (const entry of dropped) {
        scrollById.current.delete(entry.id) // truncated branch — free its offsets
      }
      const stack = [
        ...current.stack.slice(0, current.index + 1),
        { id: nextId.current++, route: target },
      ]
      return { stack, index: stack.length - 1 }
    })
    setArrivalSeq((seq) => seq + 1)
  }, [])

  const back = useCallback(() => {
    setHistory((current) =>
      current.index > 0 ? { ...current, index: current.index - 1 } : current,
    )
  }, [])

  const forward = useCallback(() => {
    setHistory((current) =>
      current.index < current.stack.length - 1 ? { ...current, index: current.index + 1 } : current,
    )
  }, [])

  const saveScrollState = useCallback((offset: number) => {
    scrollById.current.set(currentId.current, offset)
  }, [])

  const savedScroll = useCallback(
    () => scrollById.current.get(currentId.current) ?? null,
    [],
  )

  const value = useMemo<RouterValue>(
    () => ({
      route: history.stack[history.index].route,
      entryId: history.stack[history.index].id,
      arrivalSeq,
      navigate,
      back,
      forward,
      canBack: history.index > 0,
      canForward: history.index < history.stack.length - 1,
      saveScrollState,
      savedScroll,
    }),
    [history, arrivalSeq, navigate, back, forward, saveScrollState, savedScroll],
  )

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

/** Access the current route + navigation. Use within a RouterProvider. */
export function useRouter(): RouterValue {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider')
  }
  return context
}
