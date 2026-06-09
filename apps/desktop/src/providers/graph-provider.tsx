import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  forgetRecent,
  openGraph,
  recentGraphs,
  toAppError,
  type GraphInfo,
  type RecentGraph,
} from '@reflect/core'

/** Lifecycle of the active graph (Plan 02 loading gate). */
export type GraphStatus = 'loading' | 'choosing' | 'opening' | 'ready'

interface GraphContextValue {
  status: GraphStatus
  graph: GraphInfo | null
  recents: RecentGraph[]
  error: string | null
  /** Show the OS folder picker, then open (and bootstrap) the chosen graph. */
  pickAndOpen: () => Promise<void>
  /** Open a previously-used graph by its root path. */
  openRecent: (root: string) => Promise<void>
  /** Drop a graph from the recents list. */
  forget: (root: string) => Promise<void>
}

const GraphContext = createContext<GraphContextValue | null>(null)

function messageOf(error: unknown): string {
  // `toAppError` already normalizes Errors/strings/objects safely, so unknown
  // throws never render as `[object Object]`.
  return toAppError(error).message
}

/**
 * Owns the active graph and the open/choose flow. On mount it auto-opens the
 * most-recent graph (so the app reopens where you left off) and otherwise shows
 * the chooser. All durable file access goes through `@reflect/core` commands.
 */
export function GraphProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GraphStatus>('loading')
  const [graph, setGraph] = useState<GraphInfo | null>(null)
  const [recents, setRecents] = useState<RecentGraph[]>([])
  const [error, setError] = useState<string | null>(null)
  // Monotonic open token: only the most recent open may commit `graph`/`status`,
  // so overlapping opens (double-click, StrictMode remount) can't finish out of
  // order and leave us on a graph the user didn't pick last.
  const openSeq = useRef(0)

  const loadRecents = useCallback(async (): Promise<RecentGraph[]> => {
    try {
      const list = await recentGraphs()
      setRecents(list)
      return list
    } catch {
      // Not running inside Tauri (e.g. browser dev), or no store yet.
      return []
    }
  }, [])

  const openRecent = useCallback(
    async (root: string): Promise<void> => {
      const seq = ++openSeq.current
      setStatus('opening')
      setError(null)
      try {
        const info = await openGraph(root)
        if (seq !== openSeq.current) {
          return // superseded by a newer open
        }
        setGraph(info)
        setStatus('ready')
      } catch (err) {
        if (seq !== openSeq.current) {
          return
        }
        setError(messageOf(err))
        setStatus('choosing')
      }
      await loadRecents()
    },
    [loadRecents],
  )

  useEffect(() => {
    let active = true
    void (async () => {
      const list = await loadRecents()
      if (!active) {
        return
      }
      if (list.length > 0) {
        await openRecent(list[0].root)
      } else {
        setStatus('choosing')
      }
    })()
    return () => {
      active = false
    }
  }, [loadRecents, openRecent])

  const pickAndOpen = useCallback(async (): Promise<void> => {
    let selected: string | null = null
    try {
      const result = await open({
        directory: true,
        multiple: false,
        title: 'Choose a graph folder',
      })
      selected = typeof result === 'string' ? result : null
    } catch (err) {
      setError(messageOf(err))
      return
    }
    if (selected) {
      await openRecent(selected)
    }
  }, [openRecent])

  const forget = useCallback(
    async (root: string): Promise<void> => {
      try {
        await forgetRecent(root)
        await loadRecents()
      } catch {
        // best-effort
      }
    },
    [loadRecents],
  )

  const value = useMemo<GraphContextValue>(
    () => ({ status, graph, recents, error, pickAndOpen, openRecent, forget }),
    [status, graph, recents, error, pickAndOpen, openRecent, forget],
  )

  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>
}

/** Access the active graph + open/choose actions. Use within a GraphProvider. */
export function useGraph(): GraphContextValue {
  const context = useContext(GraphContext)
  if (!context) {
    throw new Error('useGraph must be used within a GraphProvider')
  }
  return context
}
