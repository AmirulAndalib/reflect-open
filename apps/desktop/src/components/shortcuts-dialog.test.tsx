import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ShortcutsDialog } from './shortcuts-dialog'
import { ShortcutsProvider, useShortcuts } from '@/providers/shortcuts-provider'

afterEach(cleanup) // `globals: false` disables testing-library's automatic cleanup

function OpenButton() {
  const { openShortcuts } = useShortcuts()
  return (
    <button type="button" onClick={openShortcuts}>
      open
    </button>
  )
}

function renderDialog() {
  return render(
    <ShortcutsProvider>
      <OpenButton />
      <ShortcutsDialog />
    </ShortcutsProvider>,
  )
}

describe('ShortcutsDialog', () => {
  it('renders nothing until opened', () => {
    renderDialog()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists both keymap scopes from the registries', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).toBeTruthy()
    // One row from each scope — derived data, so any registered binding works.
    expect(screen.getByText('Go to today')).toBeTruthy()
    expect(screen.getByText('Bold')).toBeTruthy()
    // The cheat-sheet lists itself; a user who forgot ⌘/ can re-learn it here.
    expect(screen.getByText('Keyboard shortcuts', { selector: 'li *' })).toBeTruthy()
  })

  it('keeps the sheet within the viewport and scrolls the shortcut rows', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog.className).toContain('max-h-[calc(100dvh-2rem)]')
    expect(dialog.className).toContain('overflow-hidden')
    expect(dialog.querySelector('.overflow-y-auto')).toBeTruthy()
  })

  it('uses extra desktop width for additional shortcut columns', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog.className).toContain('lg:max-w-5xl')
    expect(dialog.className).toContain('xl:max-w-6xl')
    const editorList = screen.getByRole('heading', { name: 'Editor' }).parentElement?.querySelector('ul')
    expect(editorList?.className).toContain('lg:columns-2')
    expect(editorList?.className).toContain('xl:columns-3')
  })

  it('closes on Escape', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
