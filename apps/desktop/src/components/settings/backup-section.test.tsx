import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BackupState } from '@/lib/backup-controller'
import { BackupSection } from './backup-section'

// The section's GitHub-vs-generic split (Plan 16): a hand-wired remote must
// render host-neutrally, and its auth errors must surface the engine's
// actionable message — "reconnect GitHub" can't fix an ssh-agent problem.

const sync = vi.hoisted(() => ({
  backup: { phase: 'loading' } as BackupState,
  disconnectGraph: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  backUpNow: vi.fn(async () => {}),
}))
vi.mock('@/providers/sync-provider', () => ({ useSync: () => sync }))
vi.mock('@/providers/graph-provider', () => ({ useGraph: () => ({ graph: null }) }))

afterEach(() => {
  cleanup()
})

function renderSection(backup: BackupState): void {
  sync.backup = backup
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BackupSection />
    </QueryClientProvider>,
  )
}

const AUTH_ERROR = {
  state: 'error',
  errorKind: 'auth',
  message: 'the SSH agent offered no key this host accepts — `ssh-add` the right key',
} as const

describe('BackupSection', () => {
  it('renders a generic remote host-neutrally with the engine’s own auth message', async () => {
    renderSection({
      phase: 'connected',
      remoteUrl: 'git@gitlab.com:alex/notes.git',
      repo: null,
      status: AUTH_ERROR,
    })

    expect(await screen.findByText('Backup', { selector: 'legend' })).toBeTruthy()
    expect(screen.queryByText('GitHub backup')).toBeNull()
    expect(screen.getByText('git@gitlab.com:alex/notes.git')).toBeTruthy()
    // The actionable message, not a GitHub reconnect that can't help.
    expect(screen.getByText(/ssh-add/)).toBeTruthy()
    expect(screen.queryByText(/reconnect GitHub/)).toBeNull()
    // Machine-level GitHub sign-out is noise next to a non-GitHub graph.
    expect(screen.queryByRole('button', { name: 'Sign out of GitHub' })).toBeNull()
  })

  it('renders a GitHub remote with the reconnect affordances', async () => {
    renderSection({
      phase: 'connected',
      remoteUrl: 'https://github.com/alex/notes.git',
      repo: { owner: 'alex', name: 'notes' },
      status: AUTH_ERROR,
    })

    expect(await screen.findByText('GitHub backup')).toBeTruthy()
    expect(screen.getByText('alex/notes')).toBeTruthy()
    expect(screen.getByText(/reconnect GitHub/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out of GitHub' })).toBeTruthy()
  })
})
