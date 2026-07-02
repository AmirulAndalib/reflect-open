import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { setBridge } from '@reflect/core'
import { LARGE_FILE_BYTES } from '@/lib/large-file-confirm'
import { useAssetPersistence, type AssetPersistence } from './use-asset-persistence'

const { confirmLargeFileMock } = vi.hoisted(() => ({
  confirmLargeFileMock: vi.fn(async () => true),
}))
vi.mock('@/lib/large-file-confirm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/large-file-confirm')>()),
  confirmLargeFile: confirmLargeFileMock,
}))

let persistence: AssetPersistence | null = null

function Host({
  generation,
  path = 'notes/a.md',
}: {
  generation: number | null
  path?: string
}): ReactNode {
  persistence = useAssetPersistence('/graph', generation, path)
  return null
}

/** A bridge whose upload commands succeed, echoing the committed name back. */
function installUploadBridge(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn(async (command: string, args: Record<string, unknown>) =>
    command === 'asset_upload_begin'
      ? 'upload-1'
      : command === 'asset_upload_commit'
        ? `assets/${args['desiredName'] as string}`
        : null,
  )
  setBridge({ invoke, invokeBinary: async () => null, listen: async () => () => {} })
  return invoke
}

function fileOf(name: string, type: string, size = 16): File {
  const file = new File([new Uint8Array(Math.min(size, 64))], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

afterEach(() => {
  cleanup()
  setBridge(null)
  persistence = null
  confirmLargeFileMock.mockReset()
  confirmLargeFileMock.mockResolvedValue(true)
})

describe('useAssetPersistence saveFile', () => {
  it('names a pasted image pasted-<timestamp>.<ext>, leaving collisions to Rust', async () => {
    installUploadBridge()
    render(<Host generation={3} />)

    let saved: string | null = null
    await act(async () => {
      saved = await persistence!.saveFile(fileOf('whatever.png', 'image/png'))
    })

    expect(saved).toMatch(/^assets\/pasted-\d+\.png$/)
  })

  it('keeps an attachment under its sanitized original name', async () => {
    installUploadBridge()
    render(<Host generation={3} />)

    let saved: string | null = null
    await act(async () => {
      saved = await persistence!.saveFile(fileOf('Q3 Report.PDF', 'application/pdf'))
    })

    expect(saved).toBe('assets/q3-report.pdf')
  })

  it('treats an image MIME without a known extension as a named attachment', async () => {
    installUploadBridge()
    render(<Host generation={3} />)

    let saved: string | null = null
    await act(async () => {
      saved = await persistence!.saveFile(fileOf('Scan 1.tiff', 'image/tiff'))
    })

    expect(saved).toBe('assets/scan-1.tiff')
  })

  it('gates any large file — image or not — on the app confirm', async () => {
    const invoke = installUploadBridge()
    render(<Host generation={3} />)

    confirmLargeFileMock.mockResolvedValueOnce(false)
    let declined: string | null = 'sentinel'
    await act(async () => {
      declined = await persistence!.saveFile(
        fileOf('huge.png', 'image/png', LARGE_FILE_BYTES + 1),
      )
    })
    expect(declined).toBeNull()
    expect(invoke).not.toHaveBeenCalledWith('asset_upload_begin', expect.anything())

    let approved: string | null = null
    await act(async () => {
      approved = await persistence!.saveFile(
        fileOf('huge.mov', 'video/quicktime', LARGE_FILE_BYTES + 1),
      )
    })
    expect(approved).toBe('assets/huge.mov')
    expect(confirmLargeFileMock).toHaveBeenCalledTimes(2)
  })

  it('declines without a graph session', async () => {
    const invoke = installUploadBridge()
    render(<Host generation={null} />)

    let saved: string | null = 'sentinel'
    await act(async () => {
      saved = await persistence!.saveFile(fileOf('a.pdf', 'application/pdf'))
    })
    expect(saved).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })
})

/** A bridge whose appends fail until `heal()` is called. */
function installFailingBridge(): { heal: () => void } {
  const state = { failing: true }
  const invoke = vi.fn(async (command: string, args: Record<string, unknown>) =>
    command === 'asset_upload_begin'
      ? 'upload-1'
      : command === 'asset_upload_commit'
        ? `assets/${args['desiredName'] as string}`
        : null,
  )
  setBridge({
    invoke,
    invokeBinary: async () => {
      if (state.failing) {
        throw { kind: 'io', message: 'disk full' }
      }
      return null
    },
    listen: async () => () => {},
  })
  return {
    heal: () => {
      state.failing = false
    },
  }
}

describe('useAssetPersistence errors', () => {
  it('owns save failures — never throws — keyed by how the file was named', async () => {
    const bridge = installFailingBridge()
    render(<Host generation={3} />)

    // A pasted image fails as an image…
    await act(async () => {
      await expect(persistence!.saveFile(fileOf('a.png', 'image/png'))).resolves.toBeNull()
    })
    expect(persistence!.saveError).toEqual({ kind: 'image', message: 'disk full' })

    // …an image MIME saved under its own name fails as a file (it was named
    // like an attachment, so its banner says so too).
    await act(async () => {
      await expect(persistence!.saveFile(fileOf('scan.tiff', 'image/tiff'))).resolves.toBeNull()
    })
    expect(persistence!.saveError).toEqual({ kind: 'file', message: 'disk full' })

    // The next success clears the banner.
    bridge.heal()
    await act(async () => {
      await persistence!.saveFile(fileOf('b.pdf', 'application/pdf'))
    })
    expect(persistence!.saveError).toBeNull()
  })

  it('drops a failure that lands after the note switched', async () => {
    let failLateAppend: (() => void) | null = null
    const invoke = vi.fn(async (command: string) =>
      command === 'asset_upload_begin' ? 'upload-1' : null,
    )
    setBridge({
      invoke,
      invokeBinary: () =>
        new Promise((_resolve, reject) => {
          failLateAppend = () => reject({ kind: 'io', message: 'late failure' })
        }),
      listen: async () => () => {},
    })
    const view = render(<Host generation={3} path="notes/a.md" />)

    let savePromise: Promise<string | null> | null = null
    act(() => {
      savePromise = persistence!.saveFile(fileOf('slow.pdf', 'application/pdf'))
    })
    await waitFor(() => expect(failLateAppend).not.toBeNull())

    // The user moves on; the stream then fails for the note they left.
    view.rerender(<Host generation={3} path="notes/b.md" />)
    await act(async () => {
      failLateAppend!()
      await savePromise
    })

    await expect(savePromise).resolves.toBeNull()
    expect(persistence!.saveError).toBeNull()
  })

  it('declines a large-file confirm answered after the note switched', async () => {
    const invoke = installUploadBridge()
    let approve: ((proceed: boolean) => void) | null = null
    confirmLargeFileMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          approve = resolve
        }),
    )
    const view = render(<Host generation={3} path="notes/a.md" />)

    let savePromise: Promise<string | null> | null = null
    act(() => {
      savePromise = persistence!.saveFile(
        fileOf('huge.mov', 'video/quicktime', LARGE_FILE_BYTES + 1),
      )
    })
    view.rerender(<Host generation={3} path="notes/b.md" />)
    await act(async () => {
      approve!(true)
      await savePromise
    })

    // Approved too late: nothing is written for a note that is gone.
    await expect(savePromise).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalledWith('asset_upload_begin', expect.anything())
  })
})
