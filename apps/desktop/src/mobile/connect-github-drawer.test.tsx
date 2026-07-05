import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import type { ConnectExistingResult } from '@/lib/backup-controller'
import { ConnectGithubDrawer } from './connect-github-drawer'

/**
 * The mobile connect sheet. The wizard's flow branches (create handoff,
 * grant access, public consent, error escapes) are specified against the
 * shared hook by connect-github-dialog.test.tsx; this suite covers what is
 * the drawer's own: the fixed suggested name (never the graph's), the
 * open/close lifecycle, and a fresh wizard per open.
 */

// vaul needs browser APIs jsdom doesn't provide; passthrough so the sheet
// content always renders (the drawer itself is verified on-device).
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}))

const sync = vi.hoisted(() => ({
  connectNewRepo: vi.fn(async (): Promise<'connected' | 'manualCreateNeeded'> => 'connected'),
  connectExistingRepo: vi.fn(async (): Promise<ConnectExistingResult> => 'connected'),
}))
vi.mock('@/providers/sync-provider', () => ({ useSync: () => sync }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))
const httpFetch = vi.mocked(tauriFetch)

beforeEach(() => {
  // A stored PAT + GitHub accepting it ("alex") makes the auth step skip
  // itself, so a Continue lands straight on the finish step.
  setBridge({
    invoke: async (command) =>
      command === 'secret_get' ? JSON.stringify({ kind: 'pat', token: 'ghp_abc' }) : null,
    listen: async () => () => {},
  })
  httpFetch.mockImplementation(
    async () =>
      new Response(JSON.stringify({ login: 'alex' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  sync.connectNewRepo.mockResolvedValue('connected')
  sync.connectExistingRepo.mockResolvedValue('connected')
})

afterEach(() => {
  cleanup()
  setBridge(null)
  vi.resetAllMocks()
})

describe('ConnectGithubDrawer', () => {
  it('suggests reflect-backup — never the local graph name — and connects', async () => {
    sync.connectExistingRepo.mockResolvedValueOnce('notFound')
    const onOpenChange = vi.fn()
    render(<ConnectGithubDrawer open onOpenChange={onOpenChange} pollIntervalMs={15} />)

    // The local graph's display name is the sandbox folder ("Documents") —
    // the prefill must be the fixed fallback, not a graph-derived slug.
    expect(screen.getByLabelText('Repository name')).toHaveProperty('value', 'reflect-backup')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(sync.connectExistingRepo).toHaveBeenCalledWith(
        { owner: 'alex', name: 'reflect-backup' },
        { allowPublic: false },
      ),
    )
    await waitFor(() => expect(sync.connectNewRepo).toHaveBeenCalledWith('reflect-backup'))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('connects an existing repository and closes the sheet', async () => {
    const onOpenChange = vi.fn()
    render(<ConnectGithubDrawer open onOpenChange={onOpenChange} pollIntervalMs={15} />)

    fireEvent.click(screen.getByRole('radio', { name: /use an existing repository/i }))
    fireEvent.change(screen.getByLabelText('Repository'), {
      target: { value: 'alex/notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(sync.connectExistingRepo).toHaveBeenCalledWith(
        { owner: 'alex', name: 'notes' },
        { allowPublic: false },
      ),
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('starts a fresh wizard on every open', async () => {
    const onOpenChange = vi.fn()
    const view = render(<ConnectGithubDrawer open onOpenChange={onOpenChange} />)

    // Leave the wizard mid-flow with a validation error showing.
    fireEvent.click(screen.getByRole('radio', { name: /use an existing repository/i }))
    fireEvent.change(screen.getByLabelText('Repository'), {
      target: { value: 'not a repo!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      await screen.findByText('Enter the repository as owner/name or a GitHub URL.'),
    ).toBeTruthy()

    // Close: the body unmounts entirely (which also stops any polls).
    view.rerender(<ConnectGithubDrawer open={false} onOpenChange={onOpenChange} />)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()

    // Reopen: back to the repo step defaults, no leaked error or mode.
    view.rerender(<ConnectGithubDrawer open onOpenChange={onOpenChange} />)
    expect(screen.getByRole('radio', { name: /create a new private repository/i })).toHaveProperty(
      'checked',
      true,
    )
    expect(screen.getByLabelText('Repository name')).toHaveProperty('value', 'reflect-backup')
    expect(screen.queryByText('Enter the repository as owner/name or a GitHub URL.')).toBeNull()
  })
})
