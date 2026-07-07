import { cleanup, render, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const memo = vi.hoisted(() => ({
  phase: 'idle' as 'idle' | 'requesting' | 'recording' | 'transcribing' | 'error',
  elapsedMs: 0,
  level: 0,
  pendingCount: 0,
  available: true,
  error: null as string | null,
  canRetry: false,
  drawerOpen: false,
  toggle: vi.fn(),
  stopAndSave: vi.fn(),
  cancelRecording: vi.fn(),
  onDrawerOpenChange: vi.fn(),
  retry: vi.fn(),
  discard: vi.fn(),
}))

vi.mock('@/mobile/audio-memo-provider', () => ({
  useMobileAudioMemo: () => ({ ...memo }),
}))

const { AudioMemoFab } = await import('./audio-memo-fab')

function renderFab(): RenderResult {
  return render(<AudioMemoFab />)
}

beforeEach(() => {
  vi.clearAllMocks()
  memo.phase = 'idle'
  memo.available = true
  memo.error = null
})

afterEach(cleanup)

describe('AudioMemoFab', () => {
  it('idle records on tap', async () => {
    const view = renderFab()

    await userEvent.click(view.getByRole('button', { name: 'Record audio memo' }))

    expect(memo.toggle).toHaveBeenCalledTimes(1)
  })

  it('reads as the stop control while recording', () => {
    memo.phase = 'recording'
    const view = renderFab()

    expect(view.getByRole('button', { name: 'Stop recording' })).toBeTruthy()
  })

  it('a parked failure reads as the error affordance', () => {
    memo.phase = 'error'
    memo.error = 'disk full'
    const view = renderFab()

    expect(view.getByRole('button', { name: 'Show audio memo error' })).toBeTruthy()
  })

  it('hides entirely when the feature cannot run', () => {
    memo.available = false
    const view = renderFab()

    expect(view.queryByRole('button')).toBeNull()
  })
})
