import { renderHook, act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { useICloudRefresh } from './use-icloud-refresh'

const graphState = vi.hoisted<{
  current: {
    graph: { root: string } | null
    mobileStorageKind: 'icloud' | 'local' | null
    refreshIndex: () => void
  }
}>(() => ({
  current: { graph: null, mobileStorageKind: null, refreshIndex: () => {} },
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => graphState.current,
}))

let downloadCalls: string[]
/** What the fake `icloud_download_pending` reports — placeholders remaining. */
let pendingCount: number
let refreshIndex: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  vi.useFakeTimers()
  downloadCalls = []
  pendingCount = 0
  refreshIndex = vi.fn<() => void>()
  graphState.current = {
    graph: { root: '/iCloud/Documents' },
    mobileStorageKind: 'icloud',
    refreshIndex,
  }
  setBridge({
    invoke: async (command, args) => {
      if (command === 'icloud_download_pending') {
        downloadCalls.push(String(args['root']))
        return pendingCount
      }
      return null
    },
    listen: async () => () => {},
  })
})

afterEach(() => {
  cleanup()
  setBridge(null)
  vi.useRealTimers()
  vi.clearAllMocks()
})

/** Let the pending `icloudDownloadPending` promise settle inside act. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useICloudRefresh', () => {
  it('is inert for local graphs', async () => {
    graphState.current = {
      graph: { root: '/Documents' },
      mobileStorageKind: 'local',
      refreshIndex,
    }
    renderHook(() => useICloudRefresh())
    await flush()

    expect(downloadCalls).toEqual([])
    expect(refreshIndex).not.toHaveBeenCalled()
  })

  it('nudges downloads and reconciles once on mount', async () => {
    renderHook(() => useICloudRefresh())
    await flush()

    expect(downloadCalls).toEqual(['/iCloud/Documents'])
    expect(refreshIndex).toHaveBeenCalledTimes(1)
  })

  it('polls while placeholders are pending and reconciles when they land', async () => {
    pendingCount = 3
    renderHook(() => useICloudRefresh())
    await flush()
    expect(refreshIndex).toHaveBeenCalledTimes(1)

    // Still pending after one poll: no reconcile yet, keep waiting.
    await act(async () => {
      vi.runOnlyPendingTimers()
    })
    await flush()
    expect(downloadCalls).toHaveLength(2)
    expect(refreshIndex).toHaveBeenCalledTimes(1)

    // Downloads finished: the next poll reconciles immediately — the Mac
    // edit appears seconds after it lands, not on the next resume.
    pendingCount = 0
    await act(async () => {
      vi.runOnlyPendingTimers()
    })
    await flush()
    expect(downloadCalls).toHaveLength(3)
    expect(refreshIndex).toHaveBeenCalledTimes(2)

    // Settled — no further polling.
    await act(async () => {
      vi.runOnlyPendingTimers()
    })
    await flush()
    expect(downloadCalls).toHaveLength(3)
  })

  it('gives up polling at the limit with one final reconcile', async () => {
    pendingCount = 3
    renderHook(() => useICloudRefresh())
    await flush()
    expect(refreshIndex).toHaveBeenCalledTimes(1)

    // Never finishes downloading (a big asset on a slow link): the poll caps
    // out with a last reconcile instead of spinning forever.
    for (let i = 0; i < 25; i += 1) {
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      await flush()
    }
    expect(refreshIndex).toHaveBeenCalledTimes(2)
    // Well-bounded call count: one nudge + at most limit/interval polls.
    expect(downloadCalls.length).toBeLessThanOrEqual(22)
  })

  it('collapses the resume event burst into one refresh', async () => {
    renderHook(() => useICloudRefresh())
    await flush()
    expect(downloadCalls).toHaveLength(1)

    // WKWebView fires visibilitychange + focus together on resume.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    expect(downloadCalls).toHaveLength(1) // deduped — still within the window

    await act(async () => {
      vi.advanceTimersByTime(2000)
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    expect(downloadCalls).toHaveLength(2) // a real later resume refreshes
  })

  it('stops listening after unmount', async () => {
    const { unmount } = renderHook(() => useICloudRefresh())
    await flush()
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(5000)
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    expect(downloadCalls).toHaveLength(1)
  })
})
