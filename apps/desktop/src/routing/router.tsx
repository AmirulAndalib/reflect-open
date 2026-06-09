import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { routesEqual, type Route } from './route'

/**
 * The app router (Plan 06): a history stack over typed {@link Route}s — no URL,
 * no dependency. `navigate` pushes (truncating any forward entries, like a
 * browser), `back`/`forward` move the cursor. Mount it per graph (keyed by the
 * graph root) so switching graphs starts a fresh history.
 */

interface RouterValue {
  route: Route
  navigate: (route: Route) => void
  back: () => void
  forward: () => void
  canBack: boolean
  canForward: boolean
}

const RouterContext = createContext<RouterValue | null>(null)

interface RouterProviderProps {
  /** The launch route; defaults to today (the daily note is the spine). */
  initialRoute?: Route
  children: ReactNode
}

interface HistoryState {
  stack: Route[]
  index: number
}

export function RouterProvider({
  initialRoute = { kind: 'today' },
  children,
}: RouterProviderProps): ReactElement {
  const [history, setHistory] = useState<HistoryState>({ stack: [initialRoute], index: 0 })

  const navigate = useCallback((route: Route) => {
    setHistory((current) => {
      if (routesEqual(current.stack[current.index], route)) {
        return current // no-op navigation must not grow the stack
      }
      const stack = [...current.stack.slice(0, current.index + 1), route]
      return { stack, index: stack.length - 1 }
    })
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

  const value = useMemo<RouterValue>(
    () => ({
      route: history.stack[history.index],
      navigate,
      back,
      forward,
      canBack: history.index > 0,
      canForward: history.index < history.stack.length - 1,
    }),
    [history, navigate, back, forward],
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
