import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import { pickAssetDescriptionConfig, type AiProvidersState, type GraphInfo } from '@reflect/core'
import {
  createAssetDescriptionReconciler,
  type AssetDescriptionReconciler,
  type AssetDescriptionReconcilerState,
} from '@/lib/asset-description-reconciler'
import { useSettings } from '@/providers/settings-provider'

interface AssetDescriptionContextValue extends AssetDescriptionReconcilerState {
  available: boolean
  backfill: () => Promise<void>
  lastResult: string | null
  error: string | null
}

const AssetDescriptionContext = createContext<AssetDescriptionContextValue | null>(null)

const IDLE_STATE: AssetDescriptionReconcilerState = {
  running: false,
  backfilling: false,
  progress: null,
}

interface AssetDescriptionProviderProps {
  graph: GraphInfo
  children: ReactNode
}

export function AssetDescriptionProvider({
  graph,
  children,
}: AssetDescriptionProviderProps): ReactElement {
  const { settings } = useSettings()
  const [reconciler, setReconciler] = useState<AssetDescriptionReconciler | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const providersRef = useRef<AiProvidersState>({
    providers: settings.aiProviders,
    defaultProviderId: settings.defaultAiProviderId,
  })
  useEffect(() => {
    providersRef.current = {
      providers: settings.aiProviders,
      defaultProviderId: settings.defaultAiProviderId,
    }
  })

  const available = useMemo(
    () =>
      pickAssetDescriptionConfig({
        providers: settings.aiProviders,
        defaultProviderId: settings.defaultAiProviderId,
      }) !== null,
    [settings.aiProviders, settings.defaultAiProviderId],
  )

  useEffect(() => {
    const next = createAssetDescriptionReconciler({
      generation: graph.generation,
      getProviders: () => providersRef.current,
    })
    setReconciler(next)
    next.start()
    return () => {
      next.dispose()
      setReconciler((current) => (current === next ? null : current))
    }
  }, [graph.generation])

  const hadConfigRef = useRef(available)
  useEffect(() => {
    if (available && !hadConfigRef.current) {
      reconciler?.retryQueued()
    }
    hadConfigRef.current = available
  }, [available, reconciler])

  const snapshot = useSyncExternalStore(
    reconciler?.subscribe ?? (() => () => {}),
    reconciler?.getState ?? (() => IDLE_STATE),
  )

  const value = useMemo<AssetDescriptionContextValue>(
    () => ({
      ...snapshot,
      available,
      lastResult,
      error,
      backfill: async () => {
        if (!reconciler) {
          return
        }
        setLastResult(null)
        setError(null)
        const outcome = await reconciler.backfill()
        if (outcome.stopped) {
          setError(outcome.stopped.message)
          return
        }
        setLastResult(
          `Described ${outcome.described} of ${outcome.considered} eligible assets.`,
        )
      },
    }),
    [available, error, lastResult, reconciler, snapshot],
  )

  return (
    <AssetDescriptionContext.Provider value={value}>
      {children}
    </AssetDescriptionContext.Provider>
  )
}

export function useAssetDescriptions(): AssetDescriptionContextValue {
  const value = useContext(AssetDescriptionContext)
  if (!value) {
    throw new Error('useAssetDescriptions must be used within an AssetDescriptionProvider')
  }
  return value
}
