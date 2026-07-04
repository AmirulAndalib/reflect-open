import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNote, readNote, type GraphInfo } from '@reflect/core'
import { setPlatformSurface } from '@/lib/platform-surface'
import { SyncConflictNotice } from './sync-conflict-notice'

vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  hasBridge: () => true,
  getNote: vi.fn(),
  readNote: vi.fn(),
}))

const graphState = vi.hoisted(() => ({
  graph: { root: '/g', name: 'G', generation: 3 } as GraphInfo | null,
  indexGeneration: 7 as number | null,
}))
vi.mock('@/providers/graph-provider', () => ({ useGraph: () => graphState }))

const resolution = vi.hoisted(() => ({
  busy: false,
  error: null as string | null,
  resolve: vi.fn(async () => {}),
}))
vi.mock('@/hooks/use-conflict-resolution', () => ({
  useConflictResolution: () => resolution,
}))

const NOTE = {
  path: 'notes/clash.md',
  title: 'Clash',
  dailyDate: null,
  isPrivate: false,
  hasConflict: true,
  gistUrl: null,
  gistStale: false,
}

let queryClient: QueryClient

beforeEach(() => {
  resolution.error = null
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
})

afterEach(() => {
  cleanup()
  queryClient.clear()
  setPlatformSurface({ mobileApp: false })
  vi.clearAllMocks()
})

function renderNotice(): void {
  render(
    <QueryClientProvider client={queryClient}>
      <SyncConflictNotice path="notes/clash.md" />
    </QueryClientProvider>,
  )
}

describe('SyncConflictNotice', () => {
  it('renders nothing for a note without conflict markers', async () => {
    vi.mocked(getNote).mockResolvedValue({ ...NOTE, hasConflict: false })
    renderNotice()

    await Promise.resolve() // let the query settle
    expect(screen.queryByText(/edited on two devices/i)).toBeNull()
  })

  it('offers mine/theirs/both resolutions for a conflicted note', async () => {
    vi.mocked(getNote).mockResolvedValue(NOTE)
    renderNotice()

    expect(await screen.findByText(/edited on two devices/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /keep this device’s version/i }))
    expect(resolution.resolve).toHaveBeenCalledWith('ours')

    fireEvent.click(screen.getByRole('button', { name: /keep the other device’s/i }))
    expect(resolution.resolve).toHaveBeenCalledWith('theirs')

    fireEvent.click(screen.getByRole('button', { name: /keep both/i }))
    expect(resolution.resolve).toHaveBeenCalledWith('both')
  })

  it('offers the same resolution actions on mobile', async () => {
    setPlatformSurface({ mobileApp: true })
    vi.mocked(getNote).mockResolvedValue(NOTE)
    renderNotice()

    expect(await screen.findByText(/choose what to keep/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /keep this device’s version/i }))
    expect(resolution.resolve).toHaveBeenCalledWith('ours')
  })

  it('pluralizes the buttons for a stacked three-plus-way conflict', async () => {
    vi.mocked(getNote).mockResolvedValue(NOTE)
    vi.mocked(readNote).mockResolvedValue(
      '<<<<<<< Mac\nmac\n=======\nphone\n>>>>>>> iPhone\n<<<<<<< Mac\n=======\nipad\n>>>>>>> iPad\n',
    )
    renderNotice()

    // `theirs` splices in every non-first side — naming one device would lie.
    expect(await screen.findByRole('button', { name: 'Keep the other versions' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep all' })).toBeTruthy()
    // The first side is still a single device, so it stays named.
    expect(screen.getByRole('button', { name: 'Keep “Mac”' })).toBeTruthy()
  })
})
