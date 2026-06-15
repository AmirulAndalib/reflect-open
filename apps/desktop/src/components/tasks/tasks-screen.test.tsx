import { fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenTask } from '@reflect/core'
import type { ReactNode } from 'react'
import { RouterProvider, useRouter } from '@/routing/router'
import { TasksScreen } from './tasks-screen'

const getOpenTasks = vi.hoisted(() => vi.fn())
const getCompletedTasks = vi.hoisted(() => vi.fn())
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  hasBridge: () => true,
  getOpenTasks,
  getCompletedTasks,
}))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', cloudSync: false, generation: 1 } }),
}))
vi.mock('@/lib/use-today', () => ({ useToday: () => '2026-06-14' }))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: { dateFormat: 'mdy' } }),
}))

const toggleTask = vi.hoisted(() => vi.fn())
const deleteTask = vi.hoisted(() => vi.fn())
vi.mock('@/lib/note-task', () => ({ toggleTask, deleteTask }))

const fail = vi.hoisted(() => vi.fn())
const startOperation = vi.hoisted(() => vi.fn(() => ({ fail })))
vi.mock('@/lib/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/operations')>()),
  startOperation,
}))

function task(overrides: Partial<OpenTask> = {}): OpenTask {
  const text = overrides.text ?? 'do it'
  return {
    notePath: 'notes/n.md',
    markerOffset: 2,
    // The row renders `raw`; default it to the marker line for `text` so display
    // assertions match unless a case overrides `raw` explicitly.
    raw: `[ ] ${text}`,
    checked: false,
    text,
    noteTitle: 'N',
    dueDate: null,
    dailyDate: null,
    isPinned: false,
    pinnedOrder: null,
    updatedAt: 0,
    ...overrides,
  }
}

function RouteProbe(): ReactNode {
  const { route } = useRouter()
  return <output data-testid="route">{JSON.stringify(route)}</output>
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider>
        <TasksScreen />
        <RouteProbe />
      </RouterProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  getOpenTasks.mockReset()
  getCompletedTasks.mockReset()
  getCompletedTasks.mockResolvedValue([])
  toggleTask.mockReset()
  deleteTask.mockReset()
  startOperation.mockClear()
  fail.mockReset()
})

describe('TasksScreen', () => {
  it('shows an empty state when there are no open tasks', async () => {
    getOpenTasks.mockResolvedValue([])
    const view = renderScreen()
    await view.findByText('No tasks to show.')
    view.unmount()
  })

  it('does not flash an empty state while archived tasks are still loading', async () => {
    window.sessionStorage.setItem('reflect.tasks.filter.archived', 'true')
    getOpenTasks.mockResolvedValue([])
    let resolveCompleted: (rows: OpenTask[]) => void = () => {}
    getCompletedTasks.mockReturnValue(
      new Promise<OpenTask[]>((resolve) => {
        resolveCompleted = resolve
      }),
    )
    const view = renderScreen()

    // Open resolved to []; completed still loading → no false "empty" yet.
    await waitFor(() => expect(getOpenTasks).toHaveBeenCalled())
    expect(view.queryByText('No tasks to show.')).toBeNull()

    // Completed resolves with a task → it appears (was never reported empty).
    resolveCompleted([
      task({ notePath: 'notes/p.md', text: 'archived task', noteTitle: 'P', checked: true }),
    ])
    await view.findByText('archived task')
    expect(view.queryByText('No tasks to show.')).toBeNull()
    view.unmount()
  })

  it('surfaces a failed query as an alert', async () => {
    getOpenTasks.mockRejectedValue(new Error('index unavailable'))
    const view = renderScreen()
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain('Couldn’t load tasks.')
    view.unmount()
  })

  it('surfaces a failed archived query as an alert, not a blank list', async () => {
    window.sessionStorage.setItem('reflect.tasks.filter.archived', 'true')
    getOpenTasks.mockResolvedValue([])
    getCompletedTasks.mockRejectedValue(new Error('index unavailable'))
    const view = renderScreen()
    const alert = await view.findByRole('alert')
    expect(alert.textContent).toContain('Couldn’t load tasks.')
    view.unmount()
  })

  it('clears the archived error when "show archived" is turned off', async () => {
    window.sessionStorage.setItem('reflect.tasks.filter.archived', 'true')
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/p.md', text: 'open task', noteTitle: 'P' }),
    ])
    getCompletedTasks.mockRejectedValue(new Error('index unavailable'))
    const view = renderScreen()
    await view.findByRole('alert') // archived read failed → alert

    await userEvent.click(view.getByRole('button', { name: 'Task filters' }))
    await userEvent.click(await view.findByText('Show archived tasks'))

    // The retained archived error no longer counts → open tasks render, no alert.
    await view.findByText('open task')
    expect(view.queryByRole('alert')).toBeNull()
    view.unmount()
  })

  it('groups tasks by date bucket then note, in display order', async () => {
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'daily/2026-06-14.md', dailyDate: '2026-06-14', text: 'today task', noteTitle: '2026-06-14' }),
      // Overdue needs an explicit past due date (V1 asymmetry) — a bare past
      // daily-note task would be Current.
      task({ notePath: 'notes/d.md', dueDate: '2026-06-10', text: 'overdue task', noteTitle: 'D' }),
      task({ notePath: 'notes/p.md', text: 'project task', noteTitle: 'Project' }),
    ])
    const view = renderScreen()

    await view.findByText('today task')
    const headers = view.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(headers).toEqual(['Current', 'Overdue', 'Project'])
    expect(view.getByText('overdue task')).toBeDefined()
    expect(view.getByText('project task')).toBeDefined()
    view.unmount()
  })

  it('opens a task’s source note via the open arrow', async () => {
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/p.md', dailyDate: null, text: 'project task', noteTitle: 'Project' }),
    ])
    const view = renderScreen()

    await view.findByText('project task')
    await userEvent.click(view.getByRole('button', { name: 'Open Project' }))
    expect(view.getByTestId('route').textContent).toContain('notes/p.md')
    view.unmount()
  })

  it('selects a row on click, exclusively, and clears it with Escape', async () => {
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/p.md', markerOffset: 2, text: 'first', noteTitle: 'Project' }),
      task({ notePath: 'notes/p.md', markerOffset: 3, text: 'second', noteTitle: 'Project' }),
    ])
    const view = renderScreen()

    await userEvent.click(await view.findByRole('button', { name: 'first' }))
    expect(view.getByRole('button', { name: 'first' }).getAttribute('aria-pressed')).toBe('true')
    expect(view.getByRole('button', { name: 'second' }).getAttribute('aria-pressed')).toBe('false')

    // A plain click on another row replaces the selection.
    await userEvent.click(view.getByRole('button', { name: 'second' }))
    expect(view.getByRole('button', { name: 'first' }).getAttribute('aria-pressed')).toBe('false')
    expect(view.getByRole('button', { name: 'second' }).getAttribute('aria-pressed')).toBe('true')

    await userEvent.keyboard('{Escape}')
    expect(view.getByRole('button', { name: 'second' }).getAttribute('aria-pressed')).toBe('false')
    view.unmount()
  })

  it('toggles rows with ⌘-click and selects a range with shift-click', async () => {
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/p.md', markerOffset: 2, text: 'first', noteTitle: 'Project' }),
      task({ notePath: 'notes/p.md', markerOffset: 3, text: 'second', noteTitle: 'Project' }),
      task({ notePath: 'notes/p.md', markerOffset: 4, text: 'third', noteTitle: 'Project' }),
    ])
    const view = renderScreen()
    const pressed = (name: string) =>
      view.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'

    await userEvent.click(await view.findByRole('button', { name: 'first' }))
    // ⌘-click adds the row without clearing the rest (modifier set explicitly —
    // userEvent's held modifiers don't reach its synthetic click).
    fireEvent.click(view.getByRole('button', { name: 'third' }), { metaKey: true })
    expect([pressed('first'), pressed('second'), pressed('third')]).toEqual([true, false, true])

    // Shift-click from the anchor (third) back to first selects the whole range.
    fireEvent.click(view.getByRole('button', { name: 'first' }), { shiftKey: true })
    expect([pressed('first'), pressed('second'), pressed('third')]).toEqual([true, true, true])
    view.unmount()
  })

  it('selects all with ⌘A and moves a single selection with the arrow keys', async () => {
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/a.md', markerOffset: 2, text: 'first', noteTitle: 'A' }),
      task({ notePath: 'notes/b.md', markerOffset: 2, text: 'second', noteTitle: 'B' }),
    ])
    const view = renderScreen()
    const pressed = (name: string) =>
      view.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'

    await view.findByRole('button', { name: 'first' })
    await userEvent.keyboard('{Meta>}a{/Meta}')
    expect([pressed('first'), pressed('second')]).toEqual([true, true])

    // ↓ collapses to a single moving selection.
    await userEvent.keyboard('{ArrowDown}')
    expect([pressed('first'), pressed('second')]).toEqual([false, true])
    await userEvent.keyboard('{ArrowUp}')
    expect([pressed('first'), pressed('second')]).toEqual([true, false])
    view.unmount()
  })

  it('completes the selection with ⌘↵', async () => {
    toggleTask.mockResolvedValue(undefined)
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/a.md', markerOffset: 2, raw: '[ ] first', text: 'first', noteTitle: 'A' }),
      task({ notePath: 'notes/b.md', markerOffset: 2, raw: '[ ] second', text: 'second', noteTitle: 'B' }),
    ])
    const view = renderScreen()

    await view.findByRole('button', { name: 'first' })
    await userEvent.keyboard('{Meta>}a{/Meta}') // select all
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(toggleTask).toHaveBeenCalledTimes(2))
    // Optimistically dropped from the open list.
    await waitFor(() => expect(view.queryByText('first')).toBeNull())
    view.unmount()
  })

  it('deletes the selection with ⌘⌫', async () => {
    deleteTask.mockResolvedValue(undefined)
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/a.md', markerOffset: 2, raw: '[ ] first', text: 'first', noteTitle: 'A' }),
      task({ notePath: 'notes/b.md', markerOffset: 2, raw: '[ ] second', text: 'second', noteTitle: 'B' }),
    ])
    const view = renderScreen()

    await userEvent.click(await view.findByRole('button', { name: 'first' }))
    await userEvent.keyboard('{Meta>}{Backspace}{/Meta}')
    await waitFor(() =>
      expect(deleteTask).toHaveBeenCalledWith(
        expect.objectContaining({ notePath: 'notes/a.md', markerOffset: 2 }),
        1,
      ),
    )
    await waitFor(() => expect(view.queryByText('first')).toBeNull())
    view.unmount()
  })

  it('completes a task when its checkbox is clicked', async () => {
    toggleTask.mockResolvedValue(undefined)
    getOpenTasks.mockResolvedValue([
      task({
        notePath: 'notes/p.md',
        markerOffset: 5,
        raw: '[ ] project task',
        text: 'project task',
        noteTitle: 'Project',
      }),
    ])
    const view = renderScreen()

    await userEvent.click(await view.findByRole('button', { name: 'Complete: project task' }))
    await waitFor(() =>
      expect(toggleTask).toHaveBeenCalledWith(
        expect.objectContaining({ notePath: 'notes/p.md', markerOffset: 5, raw: '[ ] project task' }),
        1,
      ),
    )
    // Optimistically removed from the list on completion.
    await waitFor(() => expect(view.queryByText('project task')).toBeNull())
    view.unmount()
  })

  it('keeps a completed task visible (struck) when archived tasks are shown', async () => {
    // With "show archived" on, completing must move the row into the completed
    // list (struck), not drop it until the refetch (Bugbot regression).
    window.sessionStorage.setItem('reflect.tasks.filter.archived', 'true')
    toggleTask.mockResolvedValue(undefined)
    getCompletedTasks.mockResolvedValue([])
    getOpenTasks.mockResolvedValue([
      task({
        notePath: 'notes/p.md',
        markerOffset: 5,
        raw: '[ ] project task',
        text: 'project task',
        noteTitle: 'Project',
      }),
    ])
    const view = renderScreen()

    await userEvent.click(await view.findByRole('button', { name: 'Complete: project task' }))
    // Flipped to completed in place — still on screen, now marked done.
    await view.findByRole('button', { name: 'Completed task' })
    expect(view.getByText('project task')).toBeDefined()
    view.unmount()
  })

  it('rolls the row back and surfaces a failed completion via the operations toast', async () => {
    toggleTask.mockRejectedValue(new Error('stale index'))
    getOpenTasks.mockResolvedValue([
      task({ notePath: 'notes/p.md', text: 'project task', noteTitle: 'Project' }),
    ])
    const view = renderScreen()

    await userEvent.click(await view.findByRole('button', { name: 'Complete: project task' }))
    await waitFor(() => expect(fail).toHaveBeenCalledWith('stale index'))
    expect(startOperation).toHaveBeenCalledWith('Completing task')
    // Rolled back: the row returns after the failed write.
    await view.findByText('project task')
    view.unmount()
  })
})
