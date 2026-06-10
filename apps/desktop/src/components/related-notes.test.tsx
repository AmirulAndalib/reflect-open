import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { RouterProvider, useRouter } from '@/routing/router'
import { RelatedNotes } from './related-notes'

const retrieve = vi.hoisted(() => vi.fn())
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  hasBridge: () => true,
  retrieve,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', cloudSync: null, generation: 1 } }),
}))
const embedStatus = vi.hoisted(() => ({ current: { status: 'ready', model: 'm' } }))
vi.mock('@/lib/use-embed-status', () => ({
  useEmbedStatus: () => embedStatus.current,
}))

function RouteProbe(): ReactNode {
  const { route } = useRouter()
  return <output data-testid="route">{JSON.stringify(route)}</output>
}

function renderRelated(path: string, seed: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider>
        <RelatedNotes path={path} seed={seed} />
        <RouteProbe />
      </RouterProvider>
    </QueryClientProvider>,
  )
}

describe('RelatedNotes', () => {
  it('lists semantic neighbors, excluding the note itself, and navigates', async () => {
    retrieve.mockResolvedValue([
      { path: 'notes/self.md', title: 'Self', score: 1, snippet: 'me', heading: null, isPrivate: false },
      { path: 'notes/kin.md', title: 'Kindred', score: 0.8, snippet: 'close by', heading: null, isPrivate: false },
    ])
    const view = renderRelated('notes/self.md', 'seed content about things')
    await view.findByText('Kindred')
    expect(view.queryByText('Self')).toBeNull() // self-excluded

    await userEvent.click(view.getByText('Kindred'))
    expect(view.getByTestId('route').textContent).toContain('notes/kin.md')
    view.unmount()
  })

  it('renders nothing when the model is not ready', async () => {
    embedStatus.current = { status: 'uninitialized' } as never
    try {
      retrieve.mockClear()
      const view = renderRelated('notes/a.md', 'seed')
      await waitFor(() => expect(view.queryByText('Related')).toBeNull())
      expect(retrieve).not.toHaveBeenCalled()
      view.unmount()
    } finally {
      embedStatus.current = { status: 'ready', model: 'm' } as never
    }
  })

  it('renders nothing for an empty seed or empty results', async () => {
    retrieve.mockResolvedValue([])
    const view = renderRelated('notes/a.md', '   ')
    await waitFor(() => expect(view.queryByText('Related')).toBeNull())
    view.unmount()
  })
})
