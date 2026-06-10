import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { setBridge } from '@reflect/core'
import { resetOperations, useOperations } from '@/lib/operations'
import { SETTINGS_QUERY_KEY, SettingsProvider, useSettings } from './settings-provider'

/**
 * Exercises the hydration + overrides contract: defaults while the load is in
 * flight, updates winning over a racing initial load, persistence deferred
 * until hydration (an early save must not drop passthrough keys on disk), and
 * a failed save leaving the applied value alone.
 */

let stored: Record<string, unknown>
let saved: unknown[]
let failSaves: boolean
/** When set, `settings_load` blocks until {@link releaseLoad} is called. */
let pendingLoad: (() => void) | null
let gateLoad: boolean

function releaseLoad(): void {
  pendingLoad?.()
  pendingLoad = null
}

function installFakeBridge(): void {
  saved = []
  failSaves = false
  gateLoad = false
  pendingLoad = null
  setBridge({
    invoke: async (command, args) => {
      switch (command) {
        case 'settings_load':
          if (gateLoad) {
            await new Promise<void>((resolve) => {
              pendingLoad = resolve
            })
          }
          return stored
        case 'settings_save':
          if (failSaves) {
            throw { kind: 'io', message: 'disk full' }
          }
          saved.push(args.settings)
          return null
        default:
          return null
      }
    },
    listen: async () => () => {},
  })
}

let queryClient: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <SettingsProvider>{children}</SettingsProvider>
  </QueryClientProvider>
)

/** Resolves once the initial settings_load has populated the query cache. */
async function loadSettled(): Promise<void> {
  await waitFor(() => expect(queryClient.getQueryData(SETTINGS_QUERY_KEY)).toBeDefined())
}

beforeEach(() => {
  stored = {}
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  installFakeBridge()
})

afterEach(() => {
  cleanup() // `globals: false` disables testing-library's automatic cleanup
  setBridge(null)
  queryClient.clear()
  resetOperations() // failed-save entries linger on a timer otherwise
})

describe('SettingsProvider', () => {
  it('serves defaults immediately, then the persisted document', async () => {
    stored = { editorMarkdownSyntax: 'show' }
    const { result } = renderHook(() => useSettings(), { wrapper })
    // Defaults are usable before the IPC load settles — no loading gate.
    expect(result.current.settings.editorMarkdownSyntax).toBe('focus')
    await waitFor(() => expect(result.current.settings.editorMarkdownSyntax).toBe('show'))
    // Hydration alone must not write the store back.
    expect(saved).toEqual([])
  })

  it('normalizes an invalid persisted value to its default', async () => {
    stored = { editorMarkdownSyntax: 'sideways' }
    const { result } = renderHook(() => useSettings(), { wrapper })
    await loadSettled()
    expect(result.current.settings.editorMarkdownSyntax).toBe('focus')
  })

  it('applies an update instantly and persists the full document', async () => {
    stored = { editorMarkdownSyntax: 'focus', futureKey: true }
    const { result } = renderHook(() => useSettings(), { wrapper })
    await loadSettled()

    act(() => {
      result.current.updateSettings({ editorMarkdownSyntax: 'show' })
    })
    // Applied synchronously — plain React state, no IO in the way.
    expect(result.current.settings.editorMarkdownSyntax).toBe('show')
    // The persisted document keeps unknown keys (newer-version settings survive).
    await waitFor(() =>
      expect(saved).toEqual([{ editorMarkdownSyntax: 'show', futureKey: true }]),
    )
  })

  it('an update racing the initial load wins and keeps passthrough keys', async () => {
    stored = { editorMarkdownSyntax: 'focus', futureKey: true }
    gateLoad = true
    const { result } = renderHook(() => useSettings(), { wrapper })

    // Update while settings_load is still in flight…
    act(() => {
      result.current.updateSettings({ editorMarkdownSyntax: 'show' })
    })
    expect(result.current.settings.editorMarkdownSyntax).toBe('show')
    // …and nothing may hit the disk before the disk has been read: a save
    // built from defaults would drop `futureKey` permanently.
    expect(saved).toEqual([])

    act(() => {
      releaseLoad()
    })
    // The load result must not clobber the update, and the deferred flush
    // persists the update merged over the *loaded* document.
    await waitFor(() =>
      expect(saved).toEqual([{ editorMarkdownSyntax: 'show', futureKey: true }]),
    )
    expect(result.current.settings.editorMarkdownSyntax).toBe('show')
  })

  it('compounding updates racing the initial load flush as one document', async () => {
    stored = { editorMarkdownSyntax: 'show' }
    gateLoad = true
    const { result } = renderHook(() => useSettings(), { wrapper })

    act(() => {
      result.current.updateSettings({ editorMarkdownSyntax: 'show' })
      result.current.updateSettings({ editorMarkdownSyntax: 'focus' })
    })
    act(() => {
      releaseLoad()
    })
    await waitFor(() => expect(saved).toEqual([{ editorMarkdownSyntax: 'focus' }]))
    expect(result.current.settings.editorMarkdownSyntax).toBe('focus')
  })

  it('keeps the applied value and surfaces a failed save as an operation', async () => {
    const { result } = renderHook(
      () => ({ ...useSettings(), operations: useOperations() }),
      { wrapper },
    )
    await loadSettled()

    failSaves = true
    act(() => {
      result.current.updateSettings({ editorMarkdownSyntax: 'show' })
    })
    await waitFor(() =>
      expect(result.current.operations).toMatchObject([
        { label: 'Saving settings', status: 'failed', error: 'disk full' },
      ]),
    )
    expect(result.current.settings.editorMarkdownSyntax).toBe('show')
  })
})
