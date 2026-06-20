import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarNoteRow } from './sidebar-note-row'

// routeForPath runs inside the row body — spying on it counts row renders
// without instrumenting the memoized component itself.
const routeForPath = vi.hoisted(() => vi.fn((path: string) => ({ kind: 'note', path })))
vi.mock('@/routing/route', () => ({
  routeForPath,
  routesEqual: () => false,
}))
vi.mock('@/routing/router', () => ({
  useRouter: () => ({ route: { kind: 'today' }, navigate: vi.fn() }),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: { dateFormat: 'iso' }, updateSettings: () => {} }),
}))

function Harness(): ReactElement {
  const [count, setCount] = useState(0)
  return (
    <div>
      <button type="button" onClick={() => setCount((current) => current + 1)}>
        bump {count}
      </button>
      <SidebarNoteRow path="notes/a.md" title="A" date={null} />
    </div>
  )
}

beforeEach(() => {
  routeForPath.mockClear()
})

describe('SidebarNoteRow (memoized)', () => {
  it('does not re-render when the parent re-renders with identical props', async () => {
    const view = render(<Harness />)
    expect(routeForPath).toHaveBeenCalledTimes(1)

    // Bump the parent twice. With React.memo and stable primitive props, the
    // row body must not run again — pinned rows shouldn't recompute on every
    // route/sidebar re-render.
    await userEvent.click(view.getByRole('button', { name: /bump/ }))
    await userEvent.click(view.getByRole('button', { name: /bump/ }))

    expect(routeForPath).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})
