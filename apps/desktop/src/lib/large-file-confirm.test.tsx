import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import {
  confirmLargeFile,
  resetLargeFileConfirms,
  useLargeFileConfirm,
  type LargeFileConfirm,
} from './large-file-confirm'

let pending: LargeFileConfirm | null = null

function Probe(): ReactNode {
  pending = useLargeFileConfirm()
  return null
}

function fileNamed(name: string): File {
  return new File([new Uint8Array(1)], name)
}

afterEach(() => {
  act(() => resetLargeFileConfirms())
  cleanup()
  pending = null
})

describe('confirmLargeFile', () => {
  it('shows the pending file and resolves with the answer', async () => {
    render(<Probe />)
    let answer: Promise<boolean> | null = null
    act(() => {
      answer = confirmLargeFile(fileNamed('big.mov'))
    })
    expect(pending?.file.name).toBe('big.mov')

    act(() => pending?.respond(true))
    await expect(answer).resolves.toBe(true)
    expect(pending).toBeNull()
  })

  it('queues concurrent confirms behind the single slot in arrival order', async () => {
    render(<Probe />)
    let first: Promise<boolean> | null = null
    let second: Promise<boolean> | null = null
    act(() => {
      first = confirmLargeFile(fileNamed('one.mov'))
      second = confirmLargeFile(fileNamed('two.mov'))
    })
    expect(pending?.file.name).toBe('one.mov')

    act(() => pending?.respond(false))
    await expect(first).resolves.toBe(false)
    expect(pending?.file.name).toBe('two.mov')

    act(() => pending?.respond(true))
    await expect(second).resolves.toBe(true)
    expect(pending).toBeNull()
  })

  it('resolves declined without showing when stale as its turn arrives', async () => {
    render(<Probe />)
    let stale = false
    let first: Promise<boolean> | null = null
    let second: Promise<boolean> | null = null
    act(() => {
      first = confirmLargeFile(fileNamed('one.mov'))
      second = confirmLargeFile(fileNamed('two.mov'), () => stale)
    })
    // The note the second ask belongs to goes away while it waits.
    stale = true

    act(() => pending?.respond(true))
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(pending).toBeNull()
  })

  it('reset declines everything pending and queued', async () => {
    render(<Probe />)
    let first: Promise<boolean> | null = null
    let second: Promise<boolean> | null = null
    act(() => {
      first = confirmLargeFile(fileNamed('one.mov'))
      second = confirmLargeFile(fileNamed('two.mov'))
    })
    act(() => resetLargeFileConfirms())
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(pending).toBeNull()
  })
})
