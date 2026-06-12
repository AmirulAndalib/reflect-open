import { cleanup, render, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const memo = vi.hoisted(() => ({
  phase: 'idle' as 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error',
  elapsedMs: 0,
  stream: null,
  available: true,
  unavailableReason: null as string | null,
  error: null as string | null,
  canRetry: false,
  toggle: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  discard: vi.fn(),
}))

vi.mock('@/providers/audio-memo-provider', () => ({
  useAudioMemo: () => ({ ...memo }),
}))

const { AudioMemoButton } = await import('./audio-memo-button')

function renderButton(): RenderResult {
  return render(
    <TooltipProvider>
      <AudioMemoButton />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  memo.phase = 'idle'
  memo.elapsedMs = 0
  memo.available = true
  memo.unavailableReason = null
  memo.error = null
  memo.canRetry = false
})

afterEach(cleanup)

describe('AudioMemoButton', () => {
  it('recording shows the stop control and the elapsed time', async () => {
    memo.phase = 'recording'
    memo.elapsedMs = 83_000
    const view = renderButton()

    expect(view.getByText('1:23')).not.toBeNull()
    await userEvent.click(view.getByRole('button', { name: 'Stop recording' }))
    expect(memo.toggle).toHaveBeenCalled()
  })

  it('escape cancels a recording without transcribing', async () => {
    memo.phase = 'recording'
    const view = renderButton()

    view.getByRole('button', { name: 'Stop recording' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(memo.cancel).toHaveBeenCalled()
    expect(memo.toggle).not.toHaveBeenCalled()
  })

  it('transcribing disables the control and shows progress', () => {
    memo.phase = 'transcribing'
    const view = renderButton()

    expect(view.getByText('Transcribing…')).not.toBeNull()
    expect(
      view.getByRole('button', { name: 'Transcribing audio memo' }),
    ).toHaveProperty('disabled', true)
  })

  it('a resumable failure offers Retry and Discard', async () => {
    memo.phase = 'error'
    memo.error = 'provider down'
    memo.canRetry = true
    const view = renderButton()

    expect(view.getByText('provider down')).not.toBeNull()
    await userEvent.click(view.getByRole('button', { name: 'Retry' }))
    expect(memo.retry).toHaveBeenCalled()
    await userEvent.click(view.getByRole('button', { name: 'Discard' }))
    expect(memo.discard).toHaveBeenCalled()
  })

  it('a non-resumable failure hides Retry', () => {
    memo.phase = 'error'
    memo.error = 'came back empty'
    memo.canRetry = false
    const view = renderButton()

    expect(view.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(view.getByRole('button', { name: 'Discard' })).not.toBeNull()
  })
})
