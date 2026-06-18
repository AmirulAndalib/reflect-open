import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { openAsset } from './commands'

afterEach(() => {
  setBridge(null)
})

describe('graph commands', () => {
  it('opens assets through the generation-pinned native command', async () => {
    const invoke = vi.fn(async () => null)
    setBridge({ invoke, listen: async () => () => {} })

    await openAsset('assets/cat.png', 7)

    expect(invoke).toHaveBeenCalledWith('asset_open', {
      path: 'assets/cat.png',
      generation: 7,
    })
  })
})
