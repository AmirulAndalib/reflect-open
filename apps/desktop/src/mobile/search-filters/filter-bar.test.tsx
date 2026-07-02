import { useState, type ReactElement, type ReactNode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import type { NoteTagFacet } from '@reflect/core'
import { FilterBar } from './filter-bar'
import { EMPTY_ALL_NOTES_FILTERS, type AllNotesFilters } from './filter-state'

/**
 * The filter badge row (Plan 19): chips toggle or open pickers, everything
 * ANDs, and Reset clears the lot including the route tag. The drawer wrapper
 * is vaul, which needs browser APIs jsdom doesn't provide; as in
 * `note-actions-menu.test.tsx` it's mocked to a passthrough so picker rows
 * are always rendered and the state flow is what's exercised.
 */

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  DrawerContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', generation: 1 } }),
}))

const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()
setBridge({ invoke: mockInvoke, listen: async () => () => {} })

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue([])
})

afterEach(cleanup)

const FACETS: NoteTagFacet[] = [
  { tag: 'Book', count: 3 },
  { tag: 'work', count: 5 },
]

/** The bar under a stateful owner, the way the shell owns filters. */
function Harness({
  routeTag = null,
  onClearRouteTag = () => {},
  onChange = () => {},
}: {
  routeTag?: string | null
  onClearRouteTag?: () => void
  onChange?: (filters: AllNotesFilters) => void
}): ReactElement {
  const [filters, setFilters] = useState(EMPTY_ALL_NOTES_FILTERS)
  return (
    <FilterBar
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next)
        onChange(next)
      }}
      facets={FACETS}
      routeTag={routeTag}
      onClearRouteTag={onClearRouteTag}
    />
  )
}

function mount(props: Parameters<typeof Harness>[0] = {}): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  )
}

describe('FilterBar', () => {
  it('toggles the Pinned chip and shows Reset only while something is active', async () => {
    const user = userEvent.setup()
    const changes: AllNotesFilters[] = []
    const view = mount({ onChange: (next) => changes.push(next) })

    expect(view.queryByRole('button', { name: /Reset/ })).toBeNull()

    await user.click(view.getByRole('button', { name: 'Pinned' }))
    expect(changes.at(-1)?.pinned).toBe(true)
    expect(view.getByRole('button', { name: 'Pinned' }).getAttribute('aria-pressed')).toBe('true')
    expect(view.getByRole('button', { name: /Reset/ })).toBeTruthy()

    await user.click(view.getByRole('button', { name: 'Pinned' }))
    expect(changes.at(-1)?.pinned).toBe(false)
    expect(view.queryByRole('button', { name: /Reset/ })).toBeNull()
  })

  it('multi-selects tags through the drawer and labels the chip with the first tag', async () => {
    const user = userEvent.setup()
    const changes: AllNotesFilters[] = []
    const view = mount({ onChange: (next) => changes.push(next) })

    await user.click(view.getByRole('button', { name: 'Tags' }))
    await user.click(view.getByRole('button', { name: /#Book/ }))
    await user.click(view.getByRole('button', { name: /#work/ }))

    expect(changes.at(-1)?.tags).toEqual(['book', 'work'])
    expect(view.getByRole('button', { name: '#Book +1' })).toBeTruthy()
  })

  it('resets badges and the route tag together', async () => {
    const user = userEvent.setup()
    const onClearRouteTag = vi.fn()
    const changes: AllNotesFilters[] = []
    const view = mount({ routeTag: 'Book', onClearRouteTag, onChange: (next) => changes.push(next) })

    // The route tag alone makes the bar active.
    await user.click(view.getByRole('button', { name: 'Daily notes' }))
    await user.click(view.getByRole('button', { name: /Reset/ }))

    expect(changes.at(-1)).toEqual(EMPTY_ALL_NOTES_FILTERS)
    expect(onClearRouteTag).toHaveBeenCalledTimes(1)
  })

  it('activates an updated preset and clears it from the drawer', async () => {
    const user = userEvent.setup()
    const changes: AllNotesFilters[] = []
    const view = mount({ onChange: (next) => changes.push(next) })

    await user.click(view.getByRole('button', { name: 'Updated' }))
    await user.click(view.getByRole('button', { name: 'Last 7 days' }))
    expect(changes.at(-1)?.updated?.label).toBe('Last 7 days')
    expect(view.getByRole('button', { name: 'Last 7 days' })).toBeTruthy()

    await user.click(view.getByRole('button', { name: 'Last 7 days' }))
    await user.click(view.getByRole('button', { name: 'Clear filter' }))
    expect(changes.at(-1)?.updated).toBeNull()
  })
})
