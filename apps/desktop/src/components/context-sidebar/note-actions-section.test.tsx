import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteActionsSection } from './note-actions-section'

const getPinnedNotes = vi.hoisted(() => vi.fn())
const toggleNotePinned = vi.hoisted(() => vi.fn(async () => true))
const operationFail = vi.hoisted(() => vi.fn())
const startOperation = vi.hoisted(() =>
  vi.fn(() => ({ progress: vi.fn(), done: vi.fn(), fail: operationFail })),
)
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  hasBridge: () => true,
  getPinnedNotes,
}))
vi.mock('@/lib/note-pin', () => ({ toggleNotePinned }))
vi.mock('@/lib/operations', () => ({ startOperation }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', cloudSync: false, generation: 7 } }),
}))

function renderSection(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NoteActionsSection path={path} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  getPinnedNotes.mockReset().mockResolvedValue([])
  toggleNotePinned.mockReset().mockResolvedValue(true)
  startOperation.mockClear()
  operationFail.mockClear()
})

describe('NoteActionsSection pin toggle', () => {
  it('offers Pin note with the platform-formatted hint and toggles on click', async () => {
    const view = renderSection('notes/a.md')
    const button = view.getByRole('button', { name: /Pin note/ })
    // jsdom reports a non-Apple platform, so Mod renders as Ctrl.
    expect(button.textContent).toContain('Ctrl+O')
    await userEvent.click(button)
    expect(toggleNotePinned).toHaveBeenCalledWith('notes/a.md', 7)
    view.unmount()
  })

  it('offers Unpin note when the index lists the note as pinned', async () => {
    getPinnedNotes.mockResolvedValue([{ path: 'daily/2026-06-10.md', title: 'June 10th, 2026', dailyDate: '2026-06-10' }])
    const view = renderSection('daily/2026-06-10.md')
    await view.findByText('Unpin note')
    await userEvent.click(view.getByRole('button', { name: /Unpin note/ }))
    expect(toggleNotePinned).toHaveBeenCalledWith('daily/2026-06-10.md', 7)
    view.unmount()
  })

  it('stays on Pin note when a different note is pinned', async () => {
    getPinnedNotes.mockResolvedValue([{ path: 'notes/other.md', title: 'Other', dailyDate: null }])
    const view = renderSection('notes/a.md')
    await waitFor(() => expect(getPinnedNotes).toHaveBeenCalled())
    expect(view.getByText('Pin note')).toBeDefined()
    expect(view.queryByText('Unpin note')).toBeNull()
    view.unmount()
  })

  it('surfaces a toggle failure through the operations status', async () => {
    toggleNotePinned.mockRejectedValueOnce({ kind: 'io', message: 'disk on fire' })
    const view = renderSection('notes/a.md')
    await userEvent.click(view.getByRole('button', { name: /Pin note/ }))
    expect(startOperation).toHaveBeenCalledWith('Pinning note')
    expect(operationFail).toHaveBeenCalled()
    view.unmount()
  })
})
