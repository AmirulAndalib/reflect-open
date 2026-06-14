import { cleanup, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteRow } from '@reflect/core'
import { resetNoteRowOverlays, setNoteRowOverlay } from '@/hooks/note-row-overlay'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NoteGistAction } from './note-gist-action'

const useGithubConnected = vi.hoisted(() => vi.fn(() => true))
const useNoteRow = vi.hoisted(() => vi.fn<(path: string) => NoteRow | null>(() => null))
const runGistPublish = vi.hoisted(() =>
  vi.fn<(path: string, generation: number) => Promise<string | null>>(
    async () => 'https://gist.github.com/alex/g1',
  ),
)

vi.mock('@/hooks/use-github-connected', () => ({ useGithubConnected }))
vi.mock('@/hooks/use-note-row', () => ({ useNoteRow }))
vi.mock('@/lib/note-gist', () => ({ runGistPublish }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', name: 'g', cloudSync: false, generation: 7 } }),
}))

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    path: 'notes/a.md',
    title: 'A',
    dailyDate: null,
    isPrivate: false,
    hasConflict: false,
    gistUrl: null,
    gistStale: false,
    ...overrides,
  }
}

function renderAction() {
  return render(
    <TooltipProvider>
      <NoteGistAction path="notes/a.md" />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  resetNoteRowOverlays()
  useGithubConnected.mockReset().mockReturnValue(true)
  useNoteRow.mockReset().mockReturnValue(null)
  runGistPublish.mockReset().mockResolvedValue('https://gist.github.com/alex/g1')
})

afterEach(() => {
  cleanup()
})

describe('NoteGistAction', () => {
  it('renders nothing without a GitHub connection', () => {
    useGithubConnected.mockReturnValue(false)
    const view = renderAction()
    expect(view.queryByRole('button')).toBeNull()
  })

  it('renders nothing for a private note', () => {
    useNoteRow.mockReturnValue(noteRow({ isPrivate: true }))
    const view = renderAction()
    expect(view.queryByRole('button')).toBeNull()
  })

  it('offers Share with private link for an unpublished note (even before its row exists)', () => {
    const view = renderAction()
    expect(view.getByRole('button', { name: /Share with private link/ })).toBeTruthy()
  })

  it('offers Republish private link once the note carries a gist', () => {
    useNoteRow.mockReturnValue(noteRow({ gistUrl: 'https://gist.github.com/alex/g1' }))
    const view = renderAction()
    expect(view.getByRole('button', { name: /Republish private link/ })).toBeTruthy()
  })

  it('publishes the open note on click', async () => {
    const view = renderAction()
    await userEvent.click(view.getByRole('button', { name: /Share with private link/ }))
    expect(runGistPublish).toHaveBeenCalledWith('notes/a.md', 7)
  })

  it('reflects an optimistic publish as Republish before the index catches up', () => {
    // The overlay is what `runGistPublish` writes on success (its contract is
    // covered in note-gist.test.ts); given one, the label flips without waiting
    // on the index.
    setNoteRowOverlay('notes/a.md', 7, { gistUrl: 'https://gist.github.com/alex/g1' })
    const view = renderAction()
    expect(view.getByRole('button', { name: /Republish private link/ })).toBeTruthy()
  })

  it('stays on Publish when the publish failed (already surfaced elsewhere)', async () => {
    runGistPublish.mockResolvedValue(null)
    const view = renderAction()
    await userEvent.click(view.getByRole('button', { name: /Share with private link/ }))

    await waitFor(() => {
      expect(view.getByRole('button', { name: /Share with private link/ })).toBeTruthy()
    })
  })

  it('holds the stale nudge while a publish is optimistically pending, then follows the index', () => {
    // A published, edited note. Right after a republish the gist matches the
    // body again, so the lagging index's "stale" must be held back rather than
    // flashing — the overlay (url-only) suppresses it until the index agrees,
    // and never waits on `gist_stale`, so a still-editing note can't mute the
    // nudge forever.
    const url = 'https://gist.github.com/alex/g1'
    useNoteRow.mockReturnValue(noteRow({ gistUrl: url, gistStale: true }))
    const accentIcon = (view: ReturnType<typeof renderAction>) =>
      view.getByRole('button').querySelector('.text-accent')

    // Nothing pending: the index reads stale, so the nudge shows.
    const idle = renderAction()
    expect(accentIcon(idle)).toBeTruthy()
    idle.unmount()

    // A fresh publish sits in the overlay: the nudge is held back.
    setNoteRowOverlay('notes/a.md', 7, { gistUrl: url })
    const pending = renderAction()
    expect(accentIcon(pending)).toBeNull()
    pending.unmount()

    // Overlay retired (the index caught up): the nudge follows the index again.
    resetNoteRowOverlays()
    const settled = renderAction()
    expect(accentIcon(settled)).toBeTruthy()
  })
})
