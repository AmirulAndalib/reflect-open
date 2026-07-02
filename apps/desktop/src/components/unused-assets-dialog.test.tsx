import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { openUnusedAssetsDialog, UnusedAssetsDialog } from './unused-assets-dialog'

vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/graph', name: 'graph', generation: 7 } }),
}))

function installBridge(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn(async (command: string) => {
    if (command === 'dir_list') {
      return [
        { path: 'assets/orphan.mov', size: 30 * 1024 * 1024, modifiedMs: 1 },
        { path: 'assets/linked.png', size: 10, modifiedMs: 1 },
      ]
    }
    if (command === 'db_query') {
      return [{ asset_path: 'assets/linked.png' }]
    }
    return null
  })
  setBridge({ invoke, listen: async () => () => {} })
  return invoke
}

afterEach(() => {
  cleanup()
  setBridge(null)
})

describe('UnusedAssetsDialog', () => {
  it('lists unreferenced files with sizes when opened', async () => {
    installBridge()
    render(<UnusedAssetsDialog />)
    expect(screen.queryByText('Unused assets')).toBeNull()

    act(() => openUnusedAssetsDialog())

    await waitFor(() => expect(screen.queryByText('orphan.mov')).not.toBeNull())
    expect(screen.queryByText('30 MB')).not.toBeNull()
    expect(screen.queryByText('linked.png')).toBeNull()
  })

  it('deletes a file to the trash and drops its row', async () => {
    const invoke = installBridge()
    const user = userEvent.setup()
    render(<UnusedAssetsDialog />)
    act(() => openUnusedAssetsDialog())
    await waitFor(() => expect(screen.queryByText('orphan.mov')).not.toBeNull())

    await user.click(screen.getByRole('button', { name: 'Delete orphan.mov' }))

    expect(invoke).toHaveBeenCalledWith('note_delete', {
      path: 'assets/orphan.mov',
      generation: 7,
    })
    await waitFor(() => expect(screen.queryByText('orphan.mov')).toBeNull())
    expect(screen.queryByText('No unused assets.')).not.toBeNull()
  })
})
