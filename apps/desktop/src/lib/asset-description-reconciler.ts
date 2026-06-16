import {
  errorMessage,
  hasBridge,
  isDescribableAssetPath,
  isNotePath,
  parseNote,
  pickAssetDescriptionConfig,
  readNote,
  reconcileAssetDescriptions,
  subscribeFileChanges,
  type AiProvidersState,
  type ReconcileAssetDescriptionsOutcome,
  type Unlisten,
} from '@reflect/core'
import { providerFetch } from '@/lib/provider-fetch'

/**
 * Background asset-description lifecycle for one graph session. Automatic work
 * is path-driven only: no startup/provider-change whole-graph scan. Explicit
 * backfill is exposed as a separate method for Settings.
 */

export interface AssetDescriptionReconcilerState {
  running: boolean
  backfilling: boolean
  progress: { done: number; total: number; path: string | null } | null
}

export interface AssetDescriptionReconciler {
  /** Attach retry/file-change triggers. Does not backfill existing assets. */
  start(): void
  /** Queue one source asset for event-driven processing. */
  scheduleAsset(path: string): void
  /** Retry any queued event-driven assets without adding new work. */
  retryQueued(): void
  /** Explicit user-triggered backfill over existing eligible assets. */
  backfill(): Promise<ReconcileAssetDescriptionsOutcome>
  /** Snapshot for Settings progress. */
  getState(): AssetDescriptionReconcilerState
  /** Subscribe to snapshot changes. */
  subscribe(listener: () => void): () => void
  /** Tear down triggers and abort in-flight provider work. */
  dispose(): void
}

export interface AssetDescriptionReconcilerOptions {
  generation: number
  getProviders: () => AiProvidersState
}

function initialState(): AssetDescriptionReconcilerState {
  return { running: false, backfilling: false, progress: null }
}

export function createAssetDescriptionReconciler(
  options: AssetDescriptionReconcilerOptions,
): AssetDescriptionReconciler {
  let disposed = false
  let running = false
  let queued = false
  let unlisten: Unlisten | null = null
  let controller: AbortController | null = null
  const pendingAssets = new Set<string>()
  const domDisposers: Array<() => void> = []
  const listeners = new Set<() => void>()
  let state = initialState()

  function emit(next: Partial<AssetDescriptionReconcilerState>): void {
    if (disposed) {
      return
    }
    state = { ...state, ...next }
    for (const listener of listeners) {
      listener()
    }
  }

  function hasConfig(): boolean {
    return pickAssetDescriptionConfig(options.getProviders()) !== null
  }

  async function assetsFromNote(path: string): Promise<string[]> {
    try {
      const source = await readNote(path, options.generation)
      const parsed = parseNote({ path, source })
      return parsed.assets.map((asset) => asset.path).filter(isDescribableAssetPath)
    } catch (cause) {
      console.error(`asset descriptions: failed to read changed note ${path}:`, cause)
      return []
    }
  }

  async function runQueued(): Promise<void> {
    if (running) {
      queued = true
      return
    }
    if (pendingAssets.size === 0 || !hasConfig()) {
      return
    }
    running = true
    emit({ running: true })
    try {
      do {
        queued = false
        const paths = [...pendingAssets].sort()
        pendingAssets.clear()
        controller = new AbortController()
        const outcome = await reconcileAssetDescriptions({
          providers: options.getProviders(),
          generation: options.generation,
          assetPaths: paths,
          fetchFn: providerFetch,
          isStale: () => disposed,
          signal: controller.signal,
        })
        controller = null
        if (outcome.stopped !== null && !disposed) {
          for (const path of paths) {
            pendingAssets.add(path)
          }
          if (outcome.stopped.reason !== 'config' && outcome.stopped.reason !== 'network') {
            console.error('asset descriptions stopped:', outcome.stopped.message)
          }
        }
      } while (queued && pendingAssets.size > 0 && !disposed)
    } finally {
      running = false
      controller = null
      emit({ running: false })
    }
  }

  function scheduleAsset(path: string): void {
    if (disposed || !isDescribableAssetPath(path)) {
      return
    }
    pendingAssets.add(path)
    void runQueued()
  }

  async function backfill(): Promise<ReconcileAssetDescriptionsOutcome> {
    if (disposed) {
      return {
        considered: 0,
        described: 0,
        skipped: {
          unsupported: 0,
          unreferenced: 0,
          private: 0,
          unmanagedSidecar: 0,
          fresh: 0,
          rejected: 0,
        },
        stopped: { reason: 'stale', message: 'the graph session ended before backfill' },
      }
    }
    if (state.running) {
      return {
        considered: 0,
        described: 0,
        skipped: {
          unsupported: 0,
          unreferenced: 0,
          private: 0,
          unmanagedSidecar: 0,
          fresh: 0,
          rejected: 0,
        },
        stopped: { reason: 'stale', message: 'asset description backfill is already running' },
      }
    }
    controller = new AbortController()
    emit({ running: true, backfilling: true, progress: { done: 0, total: 0, path: null } })
    try {
      return await reconcileAssetDescriptions({
        providers: options.getProviders(),
        generation: options.generation,
        fetchFn: providerFetch,
        isStale: () => disposed,
        signal: controller.signal,
        onProgress: (progress) => emit({ progress }),
      })
    } finally {
      controller = null
      emit({ running: false, backfilling: false, progress: null })
    }
  }

  function start(): void {
    if (disposed) {
      return
    }
    const onWake = (): void => {
      void runQueued()
    }
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    domDisposers.push(
      () => window.removeEventListener('focus', onWake),
      () => window.removeEventListener('online', onWake),
    )
    if (!hasBridge()) {
      return
    }
    void subscribeFileChanges((changes) => {
      for (const change of changes) {
        if (change.kind !== 'upsert') {
          continue
        }
        if (isDescribableAssetPath(change.path)) {
          scheduleAsset(change.path)
        } else if (isNotePath(change.path)) {
          void assetsFromNote(change.path)
            .then((assets) => {
              for (const asset of assets) {
                scheduleAsset(asset)
              }
            })
            .catch((cause: unknown) => {
              console.error('asset descriptions: note-trigger scheduling failed:', errorMessage(cause))
            })
        }
      }
    })
      .then((stop) => {
        if (disposed) {
          stop()
        } else {
          unlisten = stop
        }
      })
      .catch((cause: unknown) => {
        console.error('asset-description file-change subscription failed:', cause)
      })
  }

  return {
    start,
    scheduleAsset,
    retryQueued: () => {
      void runQueued()
    },
    backfill,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      disposed = true
      controller?.abort()
      controller = null
      unlisten?.()
      unlisten = null
      for (const stop of domDisposers.splice(0)) {
        stop()
      }
      pendingAssets.clear()
      listeners.clear()
    },
  }
}
