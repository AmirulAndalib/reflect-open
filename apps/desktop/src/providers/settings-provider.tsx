import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DEFAULT_SETTINGS,
  hasBridge,
  loadSettings,
  saveSettings,
  toAppError,
  type Settings,
} from '@reflect/core'
import { startOperation } from '@/lib/operations'

/**
 * App-wide user settings (config-dir JSON, not graph state), applied instantly.
 *
 * The design is hydration + overrides: the query reads the disk document once
 * and is never written afterwards; session updates accumulate in local state
 * and win over whatever the load returns **by construction**. There is no
 * optimistic cache write to defend, so an update racing the initial load needs
 * no cancellation or re-apply — the merge order is the whole story.
 */

export const SETTINGS_QUERY_KEY = ['settings'] as const

interface SettingsContextValue {
  settings: Settings
  /** Merge `patch` into the settings: applied immediately, persisted async. */
  updateSettings: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/** Shallow own-key equality — settings documents are flat JSON objects. */
function sameDocument(a: Settings, b: Settings): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => Object.is(a[key], b[key]))
}

interface SettingsProviderProps {
  children: ReactNode
}

export function SettingsProvider({ children }: SettingsProviderProps): ReactElement {
  const { data: loaded } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: loadSettings,
    enabled: hasBridge(),
    staleTime: Infinity,
  })
  const [overrides, setOverrides] = useState<Partial<Settings>>({})

  // Defaults are usable before the IPC load settles — no loading gate.
  const settings = useMemo<Settings>(
    () => ({ ...DEFAULT_SETTINGS, ...loaded, ...overrides }),
    [loaded, overrides],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setOverrides((current) => ({ ...current, ...patch }))
  }, [])

  // Persistence trails hydration. Nothing is written before the disk document
  // has been read — a save built from defaults would drop passthrough keys a
  // newer app version wrote — and the full merged document is saved so those
  // keys survive. An update made mid-load is simply flushed when the load
  // lands. Writes are chained so they reach disk in apply order.
  const persistQueue = useRef<Promise<void>>(Promise.resolve())
  const lastPersisted = useRef<Settings | null>(null)
  useEffect(() => {
    if (loaded === undefined) {
      return
    }
    const onDisk = lastPersisted.current ?? loaded
    if (sameDocument(settings, onDisk)) {
      lastPersisted.current = onDisk
      return
    }
    lastPersisted.current = settings
    persistQueue.current = persistQueue.current
      .then(() => saveSettings(settings))
      .catch((error: unknown) => {
        // The in-memory value stays applied; the next successful save (or
        // relaunch) reconciles. The failure is product status, not console
        // noise — surface it where backgrounded errors live.
        startOperation('Saving settings').fail(toAppError(error).message)
      })
  }, [loaded, settings])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings }),
    [settings, updateSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

/** Access the current settings and the updater. Use within a SettingsProvider. */
export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
