import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NoteConflictBanner } from './note-conflict-banner'

function renderBanner() {
  const onKeepMine = vi.fn()
  const onLoadTheirs = vi.fn()
  const view = render(
    <NoteConflictBanner onKeepMine={onKeepMine} onLoadTheirs={onLoadTheirs} />,
  )
  return { view, onKeepMine, onLoadTheirs }
}

describe('NoteConflictBanner', () => {
  it('explains the conflict and offers both resolutions', () => {
    const { view } = renderBanner()
    expect(view.getByRole('alert').textContent).toContain(
      'This note changed on disk while you had unsaved edits.',
    )
    expect(view.getByRole('button', { name: 'Keep mine' })).toBeDefined()
    expect(view.getByRole('button', { name: 'Load theirs' })).toBeDefined()
    view.unmount()
  })

  it('fires onKeepMine when keeping the editor buffer', async () => {
    const { view, onKeepMine, onLoadTheirs } = renderBanner()
    await userEvent.click(view.getByRole('button', { name: 'Keep mine' }))
    expect(onKeepMine).toHaveBeenCalledOnce()
    expect(onLoadTheirs).not.toHaveBeenCalled()
    view.unmount()
  })

  it('fires onLoadTheirs when loading the external content', async () => {
    const { view, onKeepMine, onLoadTheirs } = renderBanner()
    await userEvent.click(view.getByRole('button', { name: 'Load theirs' }))
    expect(onLoadTheirs).toHaveBeenCalledOnce()
    expect(onKeepMine).not.toHaveBeenCalled()
    view.unmount()
  })
})
