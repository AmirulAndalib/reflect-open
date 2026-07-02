import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupState } from '@/lib/backup-controller'
import { ResumeSyncEffect } from './resume-sync-effect'

/**
 * The mobile resume trigger (Plan 19, step 10): returning to the foreground
 * runs a full sync cycle — and only then. Backgrounding is the flush's job
 * (`background-flush.ts`), and an unconfigured graph must not be poked.
 */

const sync = vi.hoisted(() => ({
  backup: { phase: 'connected' } as BackupState,
  backUpNow: vi.fn(async () => {}),
}))
vi.mock('@/providers/sync-provider', () => ({
  useSync: () => ({ backup: sync.backup, backUpNow: sync.backUpNow }),
}))

let visibility: DocumentVisibilityState

beforeEach(() => {
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  sync.backup = {
    phase: 'connected',
    remoteUrl: 'https://github.com/alex/notes.git',
    repo: { owner: 'alex', name: 'notes' },
    status: { state: 'idle' },
  }
  sync.backUpNow.mockClear()
})

afterEach(cleanup)

function foreground(): void {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('ResumeSyncEffect', () => {
  it('runs a full cycle when the app returns to the foreground', () => {
    render(<ResumeSyncEffect />)

    foreground()
    expect(sync.backUpNow).toHaveBeenCalledTimes(1)
  })

  it('does not cycle on backgrounding (that is the flush path)', () => {
    render(<ResumeSyncEffect />)

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sync.backUpNow).not.toHaveBeenCalled()
  })

  it('stays quiet while no backup is connected', () => {
    sync.backup = { phase: 'disconnected' }
    render(<ResumeSyncEffect />)

    foreground()
    expect(sync.backUpNow).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const view = render(<ResumeSyncEffect />)
    view.unmount()

    foreground()
    expect(sync.backUpNow).not.toHaveBeenCalled()
  })
})
