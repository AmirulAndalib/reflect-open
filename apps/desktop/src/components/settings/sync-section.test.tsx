import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphInfo } from '@reflect/core'
import type { BackupState } from '@/lib/backup-controller'
import { SyncSection } from './sync-section'

const graph = vi.hoisted(() => ({
  current: null as GraphInfo | null,
  openRecent: vi.fn<(root: string) => Promise<boolean>>(async () => true),
}))

const sync = vi.hoisted(() => ({
  backup: { phase: 'disconnected' } as BackupState,
  disconnectGraph: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  backUpNow: vi.fn(async () => {}),
}))

vi.mock('@/lib/platform', () => ({ isMacosDesktop: true }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: graph.current, openRecent: graph.openRecent }),
}))
vi.mock('@/providers/sync-provider', () => ({ useSync: () => sync }))

function renderSection(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SyncSection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  graph.current = {
    root: '/Users/alex/Documents/Notes',
    name: 'Notes',
    generation: 1,
  }
  sync.backup = { phase: 'disconnected' }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SyncSection', () => {
  it('combines iCloud Drive and GitHub backup under Sync for local graphs', () => {
    renderSection()

    const section = screen.getByRole('region', { name: 'Sync' })
    expect(within(section).getByText('iCloud Drive', { selector: 'legend' })).toBeTruthy()
    expect(within(section).getByText('GitHub backup', { selector: 'legend' })).toBeTruthy()
    expect(within(section).getByRole('button', { name: /connect github/i })).toBeTruthy()
  })

  it('hides GitHub backup when the graph syncs through iCloud', () => {
    graph.current = {
      root: '/Users/alex/Library/Mobile Documents/iCloud~app/Documents/Notes',
      name: 'Notes',
      generation: 1,
    }

    renderSection()

    const section = screen.getByRole('region', { name: 'Sync' })
    expect(within(section).getByText('iCloud Drive', { selector: 'legend' })).toBeTruthy()
    expect(within(section).queryByText('GitHub backup')).toBeNull()
    expect(within(section).queryByRole('button', { name: /connect github/i })).toBeNull()
  })
})
