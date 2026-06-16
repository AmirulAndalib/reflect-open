import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pickAssetDescriptionConfig,
  readNote,
  reconcileAssetDescriptions,
  subscribeFileChanges,
} from '@reflect/core'
import { createAssetDescriptionReconciler } from './asset-description-reconciler'

type FileChange = { path: string; kind: 'upsert' | 'remove'; modifiedMs?: number }

const handlers = new Set<(changes: FileChange[]) => void>()

vi.mock('@reflect/core', () => ({
  errorMessage: (value: unknown) => (value instanceof Error ? value.message : String(value)),
  hasBridge: () => true,
  isDescribableAssetPath: (path: string) =>
    path.startsWith('assets/') &&
    !path.endsWith('.reflect.md') &&
    /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(path),
  isNotePath: (path: string) =>
    (path.startsWith('notes/') || path.startsWith('daily/')) && path.endsWith('.md'),
  parseNote: (_input: { path: string; source: string }) => ({
    assets: [{ path: 'assets/from-note.png' }],
  }),
  pickAssetDescriptionConfig: vi.fn(),
  readNote: vi.fn(),
  reconcileAssetDescriptions: vi.fn(),
  subscribeFileChanges: vi.fn((handler: (changes: FileChange[]) => void) => {
    handlers.add(handler)
    return Promise.resolve(() => {
      handlers.delete(handler)
    })
  }),
}))

const pickAssetDescriptionConfigMock = vi.mocked(pickAssetDescriptionConfig)
const readNoteMock = vi.mocked(readNote)
const reconcileAssetDescriptionsMock = vi.mocked(reconcileAssetDescriptions)
const subscribeFileChangesMock = vi.mocked(subscribeFileChanges)

const PROVIDERS = {
  providers: [{ id: 'cfg-openai', provider: 'openai' as const, model: 'gpt-5.5', keyHint: 'wxyz1' }],
  defaultProviderId: 'cfg-openai',
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createAssetDescriptionReconciler', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    pickAssetDescriptionConfigMock.mockReturnValue(PROVIDERS.providers[0]!)
    readNoteMock.mockResolvedValue('![asset](assets/from-note.png)')
    reconcileAssetDescriptionsMock.mockResolvedValue({
      considered: 1,
      described: 1,
      skipped: {
        unsupported: 0,
        unreferenced: 0,
        private: 0,
        unmanagedSidecar: 0,
        fresh: 0,
        rejected: 0,
      },
      stopped: null,
    })
  })

  it('schedules a changed asset path without backfilling the graph', async () => {
    const reconciler = createAssetDescriptionReconciler({
      generation: 3,
      getProviders: () => PROVIDERS,
    })
    reconciler.start()
    await flush()

    for (const handler of handlers) {
      handler([{ path: 'assets/photo.png', kind: 'upsert' }])
    }
    await flush()

    expect(reconcileAssetDescriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ assetPaths: ['assets/photo.png'], generation: 3 }),
    )
    expect(reconcileAssetDescriptionsMock.mock.calls[0]?.[0]).toHaveProperty('assetPaths')
    reconciler.dispose()
  })

  it('does not process queued assets while no provider is configured', async () => {
    pickAssetDescriptionConfigMock.mockReturnValue(null)
    const reconciler = createAssetDescriptionReconciler({
      generation: 3,
      getProviders: () => ({ providers: [], defaultProviderId: null }),
    })
    reconciler.start()
    await flush()

    for (const handler of handlers) {
      handler([{ path: 'assets/photo.png', kind: 'upsert' }])
    }
    await flush()

    expect(reconcileAssetDescriptionsMock).not.toHaveBeenCalled()
    reconciler.dispose()
  })

  it('schedules assets referenced by changed notes', async () => {
    const reconciler = createAssetDescriptionReconciler({
      generation: 3,
      getProviders: () => PROVIDERS,
    })
    reconciler.start()
    await flush()

    for (const handler of handlers) {
      handler([{ path: 'notes/source.md', kind: 'upsert' }])
    }
    await flush()

    expect(readNoteMock).toHaveBeenCalledWith('notes/source.md', 3)
    expect(reconcileAssetDescriptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ assetPaths: ['assets/from-note.png'] }),
    )
    reconciler.dispose()
  })

  it('subscribes to file changes when started', async () => {
    const reconciler = createAssetDescriptionReconciler({
      generation: 3,
      getProviders: () => PROVIDERS,
    })
    reconciler.start()
    await flush()

    expect(subscribeFileChangesMock).toHaveBeenCalled()
    reconciler.dispose()
  })
})
